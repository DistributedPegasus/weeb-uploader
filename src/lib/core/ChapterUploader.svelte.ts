import axios from 'axios';
import type { ChapterState } from './UploadingState.svelte';
import { ChapterStatus, ChapterPageStatus } from './UploadingState.svelte';
import { RATE_LIMITER_SESSION } from './ApiWithRateLimit.svelte';

export enum UploaderStatus {
	NOT_STARTED = 'NOT_STARTED',
	IN_PROGRESS = 'IN_PROGRESS',
	COMPLETED = 'COMPLETED',
	FAILED = 'FAILED',
	PAUSED = 'PAUSED', // Network error after retries exhausted
	STOPPED = 'STOPPED' // 403 error - immediate stop
}

export class ChapterUploader {
	public chapters = $state<ChapterState[]>([]);
	public status = $state<UploaderStatus>(UploaderStatus.NOT_STARTED);
	public progress = $state<number>(0); // 0 - 1 normalized progress
	public error = $state<string | null>(null);
	public currentChapterIndex = $state<number>(-1);
	public authToken = $state<string | null>(null);

	public constructor(chapters: ChapterState[], authToken: string | null = null) {
		this.chapters = chapters;
		this.authToken = authToken;
		this.status = UploaderStatus.NOT_STARTED;
		this.progress = 0;
		this.error = null;
		this.currentChapterIndex = -1;
	}

	public checkProgress(): void {
		const totalChapters = this.chapters.length;
		if (totalChapters === 0) {
			this.progress = 0;
			return;
		}

		// Calculate progress based on actual chapter states
		const progressTotal = this.chapters.reduce((sum, chapter) => sum + chapter.progress, 0);
		this.progress = progressTotal / totalChapters;
	}

	/**
	 * Checks if an error is a 403 Forbidden error
	 */
	private is403Error(error: unknown): boolean {
		if (axios.isAxiosError(error)) {
			return error.response?.status === 403;
		}
		// Check error message for 403 status
		if (error instanceof Error) {
			return error.message.includes('403') || error.message.includes('Forbidden');
		}
		return false;
	}

	/**
	 * Checks if an error is a network error (no response, timeout, network failure)
	 */
	private isNetworkError(error: unknown): boolean {
		if (axios.isAxiosError(error)) {
			// Network error: no response (connection failed, timeout, etc.)
			if (!error.response) {
				return true;
			}
			// Not a network error if we got a response (even if it's an error status)
			return false;
		}
		// Non-axios errors are not network errors
		return false;
	}

	/**
	 * Checks if a chapter or its pages have a 403 error
	 */
	private has403Error(chapter: ChapterState): boolean {
		// Check chapter error
		if (chapter.error && (chapter.error.includes('403') || chapter.error.includes('Forbidden'))) {
			return true;
		}
		// Check page errors
		for (const page of chapter.pages) {
			if (page.error && (page.error.includes('403') || page.error.includes('Forbidden'))) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Checks if a chapter or its pages have network errors
	 */
	private hasNetworkError(chapter: ChapterState): boolean {
		// Check chapter error for network-related messages
		if (chapter.error) {
			const errorLower = chapter.error.toLowerCase();
			if (
				errorLower.includes('network') ||
				errorLower.includes('timeout') ||
				errorLower.includes('econnreset') ||
				errorLower.includes('enotfound') ||
				errorLower.includes('econnrefused')
			) {
				return true;
			}
		}
		// Check page errors
		for (const page of chapter.pages) {
			if (page.error) {
				const errorLower = page.error.toLowerCase();
				if (
					errorLower.includes('network') ||
					errorLower.includes('timeout') ||
					errorLower.includes('econnreset') ||
					errorLower.includes('enotfound') ||
					errorLower.includes('econnrefused')
				) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Sleep helper for retry delays
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Uploads a chapter with retry logic for network errors
	 * Returns true if upload succeeded, false if it should stop (403 or network error after retries)
	 */
	private async uploadChapterWithRetry(
		chapter: ChapterState,
		attempt: number = 1
	): Promise<{ success: boolean; shouldStop: boolean }> {
		const MAX_RETRIES = 3;
		const RETRY_DELAYS = [2000, 5000, 10000]; // 2s, 5s, 10s

		try {
			await chapter.upload(this.authToken!);

			// Check if upload succeeded
			if (chapter.status === ChapterStatus.COMPLETED) {
				return { success: true, shouldStop: false };
			}

			// Check for 403 error - stop immediately
			if (this.has403Error(chapter)) {
				console.error('403 Forbidden error detected, stopping upload immediately');
				return { success: false, shouldStop: true };
			}

			// Check for network error
			if (this.hasNetworkError(chapter) && attempt <= MAX_RETRIES) {
				const delayIndex = attempt - 1;
				const delay = RETRY_DELAYS[delayIndex] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
				console.warn(
					`Network error detected (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms...`
				);

				// Reset chapter state for retry
				chapter.status = ChapterStatus.NOT_STARTED;
				chapter.progress = 0;
				chapter.error = null;
				chapter.associatedUploadSessionId = null;

				// Reset all pages for retry
				for (const page of chapter.pages) {
					page.status = ChapterPageStatus.NOT_STARTED;
					page.progress = 0;
					page.error = null;
					page.associatedUploadSessionFileId = null;
				}

				// Wait before retry
				await this.sleep(delay);

				// Retry
				return this.uploadChapterWithRetry(chapter, attempt + 1);
			}

			// Other errors or network error after max retries
			return { success: false, shouldStop: false };
		} catch (error) {
			// Check for 403 error in caught exception
			if (this.is403Error(error)) {
				console.error('403 Forbidden error detected, stopping upload immediately');
				return { success: false, shouldStop: true };
			}

			// Check for network error
			if (this.isNetworkError(error) && attempt <= MAX_RETRIES) {
				const delayIndex = attempt - 1;
				const delay = RETRY_DELAYS[delayIndex] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
				console.warn(
					`Network error detected (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms...`
				);

				// Wait before retry
				await this.sleep(delay);

				// Retry
				return this.uploadChapterWithRetry(chapter, attempt + 1);
			}

			// Other errors or network error after max retries
			return { success: false, shouldStop: false };
		}
	}

	public async uploadAll(): Promise<void> {
		if (this.status === UploaderStatus.IN_PROGRESS) {
			return; // Already uploading
		}

		if (!this.authToken) {
			this.status = UploaderStatus.FAILED;
			this.error = 'No authentication token provided';
			this.progress = 0;
			return;
		}

		if (this.chapters.length === 0) {
			this.status = UploaderStatus.FAILED;
			this.error = 'No chapters to upload';
			this.progress = 0;
			return;
		}

		this.status = UploaderStatus.IN_PROGRESS;
		this.progress = 0;
		this.error = null;
		this.currentChapterIndex = 0;

		try {
			// check for any preexisting upload sessions and delete them
			console.log('Deleting preexisting upload sessions');
			try {
				await this.deletePreexistingUploadSessions();
				console.log('Preexisting upload sessions deleted');
			} catch (error) {
				// Check for 403 error in delete operation
				if (this.is403Error(error)) {
					console.error('403 Forbidden error during session cleanup, stopping upload immediately');
					this.status = UploaderStatus.STOPPED;
					this.error = '403 Forbidden: Access denied';
					this.progress = 0;
					return;
				}
				// For network errors, we'll continue and let retry logic handle it
				console.warn('Error deleting preexisting sessions, continuing:', error);
			}

			const chaptersToUpload = this.chapters.filter(
				(chapter) => chapter.status !== ChapterStatus.COMPLETED
			);

			// Upload chapters one at a time
			for (let i = 0; i < chaptersToUpload.length; i++) {
				this.currentChapterIndex = i;
				const chapter = chaptersToUpload[i];
				console.log(`Uploading chapter ${i + 1}. of ${chaptersToUpload.length}:`, chapter);

				// Skip if already completed
				if (chapter.status === ChapterStatus.COMPLETED) {
					console.log(`Chapter ${i + 1}. already completed, skipping`);
					this.checkProgress();
					continue;
				}

				// Upload the chapter with retry logic
				const result = await this.uploadChapterWithRetry(chapter);

				// Check if we should stop (403 error)
				if (result.shouldStop) {
					this.status = UploaderStatus.STOPPED;
					this.error = '403 Forbidden: Access denied. Upload stopped.';
					this.progress = 0;
					return;
				}

				// Check if upload failed (after retries for network errors)
				if (!result.success) {
					// Check if it's a network error after all retries
					if (this.hasNetworkError(chapter)) {
						this.status = UploaderStatus.PAUSED;
						this.error =
							'Network error: Upload failed after 3 retry attempts. Upload paused. Please check your connection and resume manually.';
						this.progress = 0;
						return;
					}

					// Other errors
					this.status = UploaderStatus.FAILED;
					this.error =
						chapter.error || `Failed to upload chapter: ${chapter.chapterTitle || 'Unknown'}`;
					this.progress = 0;
					return;
				}

				// Update overall progress
				this.checkProgress();
			}

			// All chapters completed successfully
			this.status = UploaderStatus.COMPLETED;
			this.progress = 1;
			this.error = null;
		} catch (error) {
			console.error('Chapter Uploader: Upload error:', error);

			// Check for 403 error
			if (this.is403Error(error)) {
				this.status = UploaderStatus.STOPPED;
				this.error = '403 Forbidden: Access denied. Upload stopped.';
			} else if (this.isNetworkError(error)) {
				// Network error in outer catch (shouldn't happen, but handle it)
				this.status = UploaderStatus.PAUSED;
				this.error =
					'Network error: Upload failed. Upload paused. Please check your connection and resume manually.';
			} else {
				this.status = UploaderStatus.FAILED;
				if (error instanceof Error) {
					this.error = error.message;
				} else {
					this.error = 'Unknown error occurred during upload';
				}
			}
			this.progress = 0;
		}
	}

	public reset(): void {
		this.status = UploaderStatus.NOT_STARTED;
		this.progress = 0;
		this.error = null;
		this.currentChapterIndex = -1;

		// Reset all chapters
		for (const chapter of this.chapters) {
			chapter.status = ChapterStatus.NOT_STARTED;
			chapter.progress = 0;
			chapter.error = null;
			chapter.associatedUploadSessionId = null;

			// Reset all pages
			for (const page of chapter.pages) {
				page.status = ChapterPageStatus.NOT_STARTED;
				page.progress = 0;
				page.error = null;
				page.associatedUploadSessionFileId = null;
			}
		}
	}

	private async deletePreexistingUploadSessions(): Promise<void> {
		const response = await RATE_LIMITER_SESSION.execute(() =>
			axios.get(`https://api.weebdex.org/upload`, {
				headers: {
					Authorization: `Bearer ${this.authToken}`
				}
			})
		);

		if (response.status === 204) {
			return;
		}

		if (response.status === 200) {
			const data = response.data;
			if (!data.id || typeof data.id !== 'string') {
				return;
			}

			await RATE_LIMITER_SESSION.execute(() =>
				axios.delete(`https://api.weebdex.org/upload/${data.id}`, {
					headers: {
						Authorization: `Bearer ${this.authToken}`
					}
				})
			);
		}
	}
}

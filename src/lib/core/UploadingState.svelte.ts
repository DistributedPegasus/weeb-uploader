import axios, { type AxiosProgressEvent } from 'axios';
import {
	RATE_LIMITER_SESSION,
	RATE_LIMITER_UPLOAD,
	RATE_LIMITER_UPLOAD_COMMIT
} from './ApiWithRateLimit.svelte';
import { ChapterPageType, SelectedFolder } from './GroupedFolders';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

export class ScanGroup {
	public groupId = $state<string>('');
	public groupName = $state<string>('');
}

export class ChapterUploadingGroup {
	public groupIds = $state<string[] | null>(null);
}

export class ChapterUploadingSeries {
	public seriesId = $state<string>('');
}

export enum ChapterPageStatus {
	NOT_STARTED = 'NOT_STARTED',
	SKIPPED = 'SKIPPED',
	WAITING = 'WAITING',
	UPLOADING = 'UPLOADING',
	UPLOADED = 'UPLOADED',
	FAILED = 'FAILED'
}

export class ChapterPageState {
	public pageName = $state<string>('');
	public pageIndex = $state<number>(0);
	public pageFile = $state<File>(null as unknown as File); // Required, will be set in constructor
	public status = $state<ChapterPageStatus>(ChapterPageStatus.NOT_STARTED);
	public progress = $state<number>(0); // 0 - 1 normalized progress
	public error = $state<string | null>(null);
	public associatedUploadSessionFileId = $state<string | null>(null);
	public isDeleted = $state<boolean>(false);
	public pageType = $state<ChapterPageType>(ChapterPageType.UNKNOWN);

	public constructor(
		pageName: string,
		pageIndex: number,
		pageFile: File,
		status: ChapterPageStatus = ChapterPageStatus.NOT_STARTED,
		progress: number = 0,
		error: string | null = null,
		associatedUploadSessionFileId: string | null = null,
		isDeleted: boolean = false,
		pageType: ChapterPageType = ChapterPageType.UNKNOWN
	) {
		this.pageName = pageName;
		this.pageIndex = pageIndex;
		this.pageFile = pageFile;
		this.status = status;
		this.progress = progress;
		this.error = error;
		this.associatedUploadSessionFileId = associatedUploadSessionFileId;
		this.isDeleted = isDeleted;
		this.pageType = pageType;
	}

	public static async uploadBatchToSession(
		pages: ChapterPageState[],
		sessionId: string,
		authToken: string
	): Promise<void> {
		if (pages.length === 0) {
			return;
		}

		// Set all pages to uploading status
		for (const page of pages) {
			page.status = ChapterPageStatus.UPLOADING;
			page.progress = 0;
			page.error = null;
		}

		const formData = new FormData();
		for (const page of pages) {
			formData.append('file', page.pageFile);
		}

		// Progress-based timeout: only timeout if no progress for 1 minute
		const PROGRESS_TIMEOUT_MS = 60000; // 1 minute
		const abortController = new AbortController();
		let progressTimeoutId: ReturnType<typeof setTimeout> | null = null;

		const cancelUpload = () => {
			abortController.abort();
			// Clear timeout reference
			if (progressTimeoutId !== null) {
				clearTimeout(progressTimeoutId);
				progressTimeoutId = null;
			}
		};

		const resetProgressTimeout = () => {
			// Clear existing timeout
			if (progressTimeoutId !== null) {
				clearTimeout(progressTimeoutId);
			}
			// Set new timeout that will cancel upload if no progress
			progressTimeoutId = setTimeout(cancelUpload, PROGRESS_TIMEOUT_MS);
		};

		const onUploadProgress = (progressEvent: AxiosProgressEvent) => {
			const overallProgress = Number(progressEvent.progress?.toFixed(2) ?? 0);
			// Distribute progress evenly across all pages in the batch
			for (const page of pages) {
				page.progress = overallProgress;
			}
			// Reset timeout on progress
			resetProgressTimeout();
		};

		// Start the initial timeout
		resetProgressTimeout();

		try {
			const response = await RATE_LIMITER_UPLOAD.execute(() =>
				axios.post(`https://api.weebdex.org/upload/${sessionId}`, formData, {
					headers: {
						Authorization: `Bearer ${authToken}`
					},
					onUploadProgress: onUploadProgress,
					signal: abortController.signal,
					validateStatus: (status) => status === 200 || status === 400 // Accept 200 and 400 status codes
				})
			);

			// Clear timeout on successful completion
			if (progressTimeoutId !== null) {
				clearTimeout(progressTimeoutId);
				progressTimeoutId = null;
			}

			const data = response.data;

			// API returns an array of responses, one for each file
			if (!Array.isArray(data) || data.length !== pages.length) {
				const errorMsg = `Failed to upload batch: Expected ${pages.length} responses, got ${Array.isArray(data) ? data.length : 'invalid format'}`;
				for (const page of pages) {
					page.status = ChapterPageStatus.FAILED;
					page.error = errorMsg;
					page.progress = 0;
				}
				return;
			}

			// Map response IDs back to pages, checking for errors first
			for (let i = 0; i < pages.length; i++) {
				const responseItem = data[i];
				if (responseItem?.error) {
					// File has an error field, mark as failed
					pages[i].status = ChapterPageStatus.FAILED;
					pages[i].error = responseItem.error;
					pages[i].progress = 0;
				} else if (responseItem?.id && typeof responseItem.id === 'string') {
					// File uploaded successfully
					pages[i].associatedUploadSessionFileId = responseItem.id;
					pages[i].status = ChapterPageStatus.UPLOADED;
					pages[i].progress = 1;
					pages[i].error = null;
				} else {
					// Invalid response format
					pages[i].status = ChapterPageStatus.FAILED;
					pages[i].error = `Failed to get upload session file ID: Invalid response format`;
					pages[i].progress = 0;
				}
			}
		} catch (error) {
			console.error(error);

			// Generic error handling
			for (const page of pages) {
				page.status = ChapterPageStatus.FAILED;
				page.progress = 0;

				if (axios.isAxiosError(error)) {
					// Check if the request was aborted due to timeout (no progress)
					if (error.code === 'ERR_CANCELED' || error.message === 'canceled') {
						page.error = `Upload timeout: No progress detected for ${PROGRESS_TIMEOUT_MS / 1000} seconds`;
					} else {
						const status = error.response?.status;
						const statusText = error.response?.statusText;
						const message = error.response?.data?.message || error.message;

						// Include status code in error message for better error detection
						if (status) {
							page.error = `HTTP ${status}${statusText ? ` ${statusText}` : ''}: ${message || 'Unknown error'}`;
						} else {
							page.error = message || `Network error: ${statusText || 'Unknown error'}`;
						}
					}
				} else if (error instanceof Error) {
					page.error = error.message;
				} else {
					page.error = 'Unknown error occurred during upload';
				}
			}
		}
	}
}

export enum ChapterStatus {
	NOT_STARTED = 'NOT_STARTED',
	WAITING = 'WAITING',
	IN_PROGRESS = 'IN_PROGRESS',
	COMPLETED = 'COMPLETED',
	FAILED = 'FAILED'
}

export class ChapterState {
	public originalFolderPath = $state<string | null>(null);
	public chapterTitle = $state<string | null>(null);
	public chapterVolume = $state<string | null>(null);
	public chapterNumber = $state<string | null>(null);
	public language = $state<string>('en');

	public associatedSeries = $state<ChapterUploadingSeries | null>(null);
	public associatedGroup = $state<ChapterUploadingGroup>(null as unknown as ChapterUploadingGroup);
	public pages = $state<ChapterPageState[]>([]);
	public status = $state<ChapterStatus>(ChapterStatus.NOT_STARTED);
	public progress = $state<number>(0); // 0 - 1 normalized progress
	public error = $state<string | null>(null);

	public associatedUploadSessionId = $state<string | null>(null);
	public originalSelectedFolder = $state<SelectedFolder | null>(null);

	// Manual edit tracking
	public manuallyEditedFields = $state<SvelteSet<string>>(new SvelteSet());
	public originalFieldValues = $state<SvelteMap<string, unknown>>(new SvelteMap());

	public isDeleted = $state<boolean>(false);

	public constructor(
		originalFolderPath: string | null,
		chapterTitle: string | null,
		chapterVolume: string | null,
		chapterNumber: string | null,
		associatedSeries: ChapterUploadingSeries,
		associatedGroup: ChapterUploadingGroup,
		pages: ChapterPageState[],
		status: ChapterStatus = ChapterStatus.NOT_STARTED,
		progress: number = 0,
		error: string | null = null,
		associatedUploadSessionId: string | null = null,
		originalSelectedFolder: SelectedFolder | null = null,
		isDeleted: boolean = false,
		language: string = 'en'
	) {
		this.originalFolderPath = originalFolderPath;
		this.chapterTitle = chapterTitle;
		this.chapterVolume = chapterVolume;
		this.chapterNumber = chapterNumber;
		this.associatedSeries = associatedSeries;
		this.associatedGroup = associatedGroup;
		this.pages = pages;
		this.status = status;
		this.progress = progress;
		this.error = error;
		this.associatedUploadSessionId = associatedUploadSessionId;
		this.originalSelectedFolder = originalSelectedFolder;
		this.manuallyEditedFields = new SvelteSet();
		this.originalFieldValues = new SvelteMap();
		this.isDeleted = isDeleted;
		this.language = language;
	}

	public checkProgress(): void {
		const totalPages = this.pages.length;
		if (totalPages === 0) {
			this.progress = 0;
			return;
		}
		const progressTotal = this.pages.reduce((acc, page) => acc + page.progress, 0);
		this.progress = progressTotal / totalPages;
	}

	/**
	 * Chunks pages into batches respecting both max page count and max total size limits.
	 * @param pages - Array of pages to chunk
	 * @param maxPagesPerBatch - Maximum number of pages per batch (default: 10)
	 * @param maxSizePerBatchBytes - Maximum total size per batch in bytes (default: 100MB)
	 * @returns Array of page batches
	 */
	private chunkPagesBySizeAndCount(
		pages: ChapterPageState[],
		maxPagesPerBatch: number = 10,
		maxSizePerBatchBytes: number = 100 * 1024 * 1024 // 100MB
	): ChapterPageState[][] {
		const batches: ChapterPageState[][] = [];
		let currentBatch: ChapterPageState[] = [];
		let currentBatchSize = 0;

		for (const page of pages) {
			const pageSize = page.pageFile.size;

			// Check if a single file exceeds the size limit
			if (pageSize > maxSizePerBatchBytes) {
				// Mark this page as failed since it exceeds the limit
				page.status = ChapterPageStatus.FAILED;
				page.error = `File size (${(pageSize / (1024 * 1024)).toFixed(2)}MB) exceeds maximum batch size limit (${(maxSizePerBatchBytes / (1024 * 1024)).toFixed(2)}MB)`;
				page.progress = 0;
				continue; // Skip this page
			}

			// Check if adding this page would exceed either limit
			const wouldExceedPageLimit = currentBatch.length >= maxPagesPerBatch;
			const wouldExceedSizeLimit = currentBatchSize + pageSize > maxSizePerBatchBytes;

			if (wouldExceedPageLimit || wouldExceedSizeLimit) {
				// Start a new batch if current batch has any pages
				if (currentBatch.length > 0) {
					batches.push(currentBatch);
					currentBatch = [];
					currentBatchSize = 0;
				}
			}

			// Add page to current batch
			currentBatch.push(page);
			currentBatchSize += pageSize;
		}

		// Add the last batch if it has any pages
		if (currentBatch.length > 0) {
			batches.push(currentBatch);
		}

		return batches;
	}

	public async upload(token: string): Promise<void> {
		this.status = ChapterStatus.IN_PROGRESS;
		this.progress = 0;
		this.error = null;

		if (!this.associatedGroup || !this.associatedSeries) {
			this.status = ChapterStatus.FAILED;
			this.error = 'No associated group or series';
			this.progress = 0;
			return;
		}

		if (this.pages.length === 0) {
			this.status = ChapterStatus.FAILED;
			this.error = 'No pages to upload';
			this.progress = 0;
			return;
		}

		const groupIds = this.associatedGroup.groupIds ?? [];

		const sessionRequest = {
			groups: groupIds,
			manga: this.associatedSeries.seriesId
		};

		try {
			// first we create the upload session
			const response = await RATE_LIMITER_SESSION.execute(() =>
				axios.post(`https://api.weebdex.org/upload/begin`, sessionRequest, {
					headers: {
						Authorization: `Bearer ${token}`
					},
					timeout: 60000 // 10 second timeout
				})
			);

			const data = response.data;
			const uploadSessionId = data.id;

			if (!uploadSessionId || typeof uploadSessionId !== 'string') {
				this.status = ChapterStatus.FAILED;
				this.error = `Failed to get upload session ID: Invalid response format`;
				this.progress = 0;
				console.dir(data, { depth: null });
				return;
			}

			this.associatedUploadSessionId = uploadSessionId;
			this.checkProgress(); // Update progress after session creation

			// now we upload the pages in batches respecting both max 10 pages and max 100MB per request
			// Process 3 chunks concurrently for better performance
			const CONCURRENT_CHUNKS = 3;
			const MAX_PAGES_PER_BATCH = 10;
			const MAX_SIZE_PER_BATCH_BYTES = 30 * 1024 * 1024; // 100MB

			const nonDeletedPages = this.pages.filter((page) => !page.isDeleted);
			const deletedPages = this.pages.filter((page) => page.isDeleted);

			for (const page of deletedPages) {
				page.status = ChapterPageStatus.SKIPPED;
			}

			const pageChunks = this.chunkPagesBySizeAndCount(
				nonDeletedPages,
				MAX_PAGES_PER_BATCH,
				MAX_SIZE_PER_BATCH_BYTES
			);

			// Check if any pages were marked as failed during chunking (e.g., exceeded size limits)
			const failedDuringChunking = nonDeletedPages.filter(
				(page) => page.status === ChapterPageStatus.FAILED
			);
			if (failedDuringChunking.length > 0) {
				this.status = ChapterStatus.FAILED;
				this.progress = 0;
				await this.cleanupFailedUpload(token);
				return;
			}

			// Process chunks in groups of 3 concurrently
			for (let i = 0; i < pageChunks.length; i += CONCURRENT_CHUNKS) {
				const chunkGroup = pageChunks.slice(i, i + CONCURRENT_CHUNKS);

				// Upload all chunks in this group concurrently
				await Promise.all(
					chunkGroup.map((batch) =>
						ChapterPageState.uploadBatchToSession(batch, uploadSessionId, token)
					)
				);

				// Validate none of the uploads failed across all chunks in this group
				const failedPages: ChapterPageState[] = [];
				for (const batch of chunkGroup) {
					console.log('batch', batch);
					failedPages.push(...batch.filter((page) => page.status === ChapterPageStatus.FAILED));
				}

				if (failedPages.length > 0) {
					// Don't set chapter.error for page-level errors - let individual page errors be shown
					// Only set chapter status to failed, but keep error null so UI can distinguish
					this.status = ChapterStatus.FAILED;
					this.progress = 0;
					await this.cleanupFailedUpload(token);
					return;
				}

				this.checkProgress();
			}

			// Gather upload IDs, preserving page order
			// Only count non-deleted pages since deleted pages are skipped
			const expectedUploadCount = nonDeletedPages.length;
			const gatheredUploads: string[] = this.pages
				.map((page) => page.associatedUploadSessionFileId)
				.filter((id): id is string => id !== null);

			if (gatheredUploads.length !== expectedUploadCount) {
				this.status = ChapterStatus.FAILED;
				this.error = `Failed to upload some pages: ${expectedUploadCount - gatheredUploads.length} page(s) missing upload IDs`;
				this.progress = 0;
				await this.cleanupFailedUpload(token);
				return;
			}

			const finalizedUploadRequest = {
				draft: {
					chapter: this.chapterNumber?.toString() ?? '',
					volume: this.chapterVolume?.toString() ?? '',
					title: this.chapterTitle ?? '',
					language: this.language
				},
				page_order: gatheredUploads
			};

			await RATE_LIMITER_UPLOAD_COMMIT.execute(() =>
				axios.post(
					`https://api.weebdex.org/upload/${this.associatedUploadSessionId}/commit`,
					finalizedUploadRequest,
					{
						headers: {
							Authorization: `Bearer ${token}`
						},
						timeout: 60000 // 10 second timeout
					}
				)
			);

			this.status = ChapterStatus.COMPLETED;
			this.progress = 1;
			this.error = null;
		} catch (error) {
			this.status = ChapterStatus.FAILED;
			this.progress = 0;

			if (axios.isAxiosError(error)) {
				const status = error.response?.status;
				const statusText = error.response?.statusText;
				const message = error.response?.data?.message || error.message;

				// Include status code in error message for better error detection
				if (status) {
					this.error = `HTTP ${status}${statusText ? ` ${statusText}` : ''}: ${message || 'Unknown error'}`;
				} else {
					this.error = message || `Network error: ${statusText || 'Unknown error'}`;
				}
			} else if (error instanceof Error) {
				this.error = error.message;
			} else {
				this.error = 'Unknown error occurred during upload';
			}

			await this.cleanupFailedUpload(token);
		}
	}

	public async cleanupFailedUpload(token: string): Promise<void> {
		if (!this.associatedUploadSessionId) {
			return;
		}

		await RATE_LIMITER_SESSION.execute(() =>
			axios.delete(`https://api.weebdex.org/upload/${this.associatedUploadSessionId}`, {
				headers: {
					Authorization: `Bearer ${token}`
				},
				timeout: 60000 // 10 second timeout
			})
		);
	}
}

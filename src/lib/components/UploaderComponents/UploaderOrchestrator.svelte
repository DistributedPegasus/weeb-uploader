<script lang="ts">
	import { getContext } from 'svelte';
	import {
		TargetingState,
		targetingStateContext
	} from '../TargetingComponents/TargetingState.svelte';
	import UploaderChapterProgression from './UploaderChapterProgression.svelte';
	import { ChapterPageStatus, ChapterStatus } from '$lib/core/UploadingState.svelte';
	import { ApiAuthContext, apiAuthContext } from '$lib/core/GlobalState.svelte';
	import { ChapterUploader, UploaderStatus } from '$lib/core/ChapterUploader.svelte';
	import { AutomationState, automationStateContext } from '../GuidedComponents/GuidedState.svelte';
	import TargetingAuthValidator from '../TargetingComponents/TargetingAuthValidator.svelte';

	const authContext = getContext<ApiAuthContext>(apiAuthContext);
	if (!authContext) {
		throw new Error(
			'UploaderOrchestrator must be used within a component that provides ApiAuthContext context'
		);
	}

	const targetingState = getContext<TargetingState>(targetingStateContext);
	if (!targetingState) {
		throw new Error(
			'UploaderOrchestrator must be used within a component that provides TargetingState context'
		);
	}

	// Get automation state (optional - automation may not be enabled)
	const automationState = getContext<AutomationState>(automationStateContext);

	let chapters = $derived(targetingState.chapterStates.filter((chapter) => !chapter.isDeleted));

	interface Props {
		onDone: (success: boolean) => void;
		busy: boolean;
	}

	let { onDone, busy: working = $bindable(false) }: Props = $props();

	let chaptersTotal = $derived(chapters.length);
	let chaptersCompleted = $derived(
		chapters.filter((chapter) => chapter.status === ChapterStatus.COMPLETED).length
	);
	let pagesTotal = $derived(chapters.reduce((acc, chapter) => acc + chapter.pages.length, 0));
	let pagesUploaded = $derived(
		chapters.reduce(
			(acc, chapter) =>
				acc + chapter.pages.filter((page) => page.status === ChapterPageStatus.UPLOADED).length,
			0
		)
	);
	let chaptersWithWebp = $derived(
		chapters
			.filter((chapter) =>
				chapter.pages.some((page) => {
					const fileName = page.pageFile.name.toLowerCase();
					return fileName.endsWith('.webp');
				})
			)
			.map((chapter) => ({
				title: chapter.chapterTitle || chapter.originalFolderPath || 'Untitled Chapter',
				path: chapter.originalFolderPath || 'Unknown path'
			}))
	);
	let hasWebpFiles = $derived(chaptersWithWebp.length > 0);

	let chapterUploader = $state<ChapterUploader | null>(null);
	let isUploading = $state(false);
	const originalTitle = document.title;

	// Handle beforeunload event to warn user when upload is in progress
	$effect(() => {
		const beforeUnloadHandler = (event: BeforeUnloadEvent) => {
			// Call preventDefault to trigger the dialog
			event.preventDefault();
			// Return a string value (browsers may show this in the dialog)
			return 'Upload in progress. Are you sure you want to leave?';
		};

		if (isUploading) {
			window.addEventListener('beforeunload', beforeUnloadHandler);
			return () => {
				window.removeEventListener('beforeunload', beforeUnloadHandler);
			};
		}
	});

	// Update browser tab title to show upload progress
	$effect(() => {
		if (isUploading) {
			document.title = `WU (${chaptersCompleted}/${chaptersTotal})`;
		} else {
			document.title = originalTitle;
		}
	});

	export function startUpload() {
		if (!authContext.apiToken) {
			alert('Please set up API authentication first');
			return;
		}

		if (!targetingState.seriesId) {
			alert('Please set a series ID first');
			return;
		}

		if (targetingState.chapterStates.length === 0) {
			alert('No chapters to upload');
			return;
		}

		console.log('Starting upload');
		console.log('API Token:', authContext.apiToken);
		console.log('Series ID:', targetingState.seriesId);
		console.log('Chapters:', targetingState.chapterStates);

		// Reset only errored chapter statuses before starting upload
		// Only reset chapters that are in FAILED state, not completed ones
		for (const chapter of targetingState.chapterStates) {
			if (chapter.status === ChapterStatus.FAILED) {
				console.log('Resetting failed chapter:', chapter);

				chapter.status = ChapterStatus.NOT_STARTED;
				chapter.progress = 0;
				chapter.error = null;
				chapter.associatedUploadSessionId = null;

				// Reset all pages for failed chapters
				for (const page of chapter.pages) {
					// Only reset pages that are in error state
					if (page.status === ChapterPageStatus.FAILED) {
						page.status = ChapterPageStatus.NOT_STARTED;
						page.progress = 0;
						page.error = null;
						page.associatedUploadSessionFileId = null;
					}
				}
			}
		}

		// Create a new uploader instance with current chapters
		chapterUploader = new ChapterUploader(chapters, authContext.apiToken);

		isUploading = true;
		working = true;

		// Start the upload
		chapterUploader
			.uploadAll()
			.then(() => {
				isUploading = false;
				// Check uploader status
				const status = chapterUploader?.status;

				// Handle PAUSED status (network error after retries)
				if (status === UploaderStatus.PAUSED) {
					console.error('Upload paused due to network errors after retries');
					if (automationState?.isActive) {
						console.log('Stopping automation due to paused upload');
						automationState.disable();
					}
					onDone(false);
					return;
				}

				// Handle STOPPED status (403 error)
				if (status === UploaderStatus.STOPPED) {
					console.error('Upload stopped due to 403 Forbidden error');
					if (automationState?.isActive) {
						console.log('Stopping automation due to 403 error');
						automationState.disable();
					}
					onDone(false);
					return;
				}

				// Check if upload was successful
				const success = status === UploaderStatus.COMPLETED;
				onDone(success);
			})
			.catch((error) => {
				console.error('Upload error:', error);
				isUploading = false;
				onDone(false);
			})
			.finally(() => {
				working = false;
			});
	}

	function prettyFormatProgress(progress: number): string {
		const roundedProgress = Math.round(progress * 100);
		return `${roundedProgress}%`;
	}

	// Expose uploader status for parent components
	export function getUploaderStatus(): UploaderStatus | null {
		return chapterUploader?.status ?? null;
	}
</script>

<div class="flex flex-col gap-2">
	{#if hasWebpFiles}
		<div
			class="flex flex-col gap-2 bg-yellow-500/20 dark:bg-yellow-500/10 border-1 border-yellow-500 rounded-md p-3"
		>
			<p class="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
				⚠️ Warning: .webp files detected
			</p>
			<p class="text-xs text-yellow-700 dark:text-yellow-300">
				Some chapters contain .webp files. Please verify these files are correctly formatted before
				uploading.
			</p>
			<div class="flex flex-col gap-1 mt-1">
				<p class="text-xs font-semibold text-yellow-700 dark:text-yellow-300">
					Chapters with .webp files ({chaptersWithWebp.length}):
				</p>
				<div class="flex flex-col gap-1 max-h-48 overflow-y-auto">
					{#each chaptersWithWebp as { title, path }}
						<div
							class="text-xs text-yellow-700 dark:text-yellow-300 border-l-2 border-yellow-500 pl-2"
						>
							<p class="font-medium">{title}</p>
							<p class="text-xs opacity-75 font-mono">{path}</p>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<h1 class="text-2xl font-bold text-app">Upload Progress</h1>

	<div class="flex flex-row gap-2">
		<button
			disabled={isUploading}
			class="btn-primary disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-md"
			onclick={startUpload}>Start</button
		>
	</div>

	<div class="flex flex-col gap-2 bg-surface rounded-md p-2">
		<p class="text-sm text-app">Chapters: {chaptersCompleted} / {chaptersTotal}</p>
		<p class="text-sm text-app">Pages: {pagesUploaded} / {pagesTotal}</p>

		<div class="relative w-full h-5 bg-surface-hover rounded-md overflow-clip">
			<div
				class="h-full bg-blue-500 dark:bg-blue-400"
				style="width: {(pagesUploaded / pagesTotal) * 100}%"
			></div>
			<p class="text-xs absolute inset-0 text-app flex items-center justify-center">
				{prettyFormatProgress(pagesUploaded / pagesTotal)}
			</p>
		</div>
	</div>

	{#if chapterUploader?.status === UploaderStatus.PAUSED}
		<div
			class="flex flex-col gap-2 bg-yellow-500/20 dark:bg-yellow-500/10 border-1 border-yellow-500 rounded-md p-3"
		>
			<p class="text-sm font-semibold text-yellow-600 dark:text-yellow-400">⏸️ Upload Paused</p>
			<p class="text-xs text-yellow-700 dark:text-yellow-300">
				{chapterUploader.error ||
					'Network error: Upload failed after 3 retry attempts. Please check your connection and resume manually.'}
			</p>
			<p class="text-xs text-yellow-700 dark:text-yellow-300">
				Automation has been stopped. Please resolve the issue and resume uploading manually.
			</p>
		</div>
	{/if}

	{#if chapterUploader?.status === UploaderStatus.STOPPED}
		<div
			class="flex flex-col gap-2 bg-red-500/20 dark:bg-red-500/10 border-1 border-red-500 rounded-md p-3"
		>
			<p class="text-sm font-semibold text-red-600 dark:text-red-400">🛑 Upload Stopped</p>
			<p class="text-xs text-red-700 dark:text-red-300">
				{chapterUploader.error || '403 Forbidden: Access denied. Upload stopped immediately.'}
			</p>
			<p class="text-xs text-red-700 dark:text-red-300">
				Automation has been stopped. Please check your API token and permissions.
			</p>
		</div>
		<div class="mt-2">
			<TargetingAuthValidator />
		</div>
	{/if}

	<div class="flex flex-col gap-2">
		{#each chapters as chapter, index}
			<UploaderChapterProgression {chapter} />
		{/each}
	</div>
</div>

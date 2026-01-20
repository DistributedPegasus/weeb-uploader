<script lang="ts">
	import type { GuidedState } from './GuidedState.svelte';
	import { MangaProcessingStatus } from './GuidedState.svelte';

	interface Props {
		guidedState: GuidedState;
		class?: string;
		onDone: () => void;
	}

	let { guidedState, class: className = '', onDone }: Props = $props();

	let inputElementRef: HTMLInputElement | null = $state(null);
	let isScanning = $state(false);

	async function handleChangeFiles(event: Event) {
		isScanning = true;

		const input = event.target as HTMLInputElement;
		const files = Array.from(input.files ?? []);

		// Find all zip files and track their parent manga folder
		const zipFileInfos: Array<{
			file: File;
			mangaFolderName: string;
			mangaFolderPath: string;
		}> = [];

		for (const file of files) {
			const relativePath = (file as any).webkitRelativePath || file.name;
			const pathParts = relativePath.split('/').filter(Boolean);

			if (pathParts.length >= 2) {
				// Path should be: mangaFolder/zipFile.zip
				const mangaFolderName = pathParts[0];
				const mangaFolderPath = pathParts[0];
				const extension = file.name.split('.').pop()?.toLowerCase();

				// Only track zip/cbz files
				if (extension === 'zip' || extension === 'cbz') {
					zipFileInfos.push({
						file,
						mangaFolderName,
						mangaFolderPath
					});
				}
			}
		}

		// Update guided state with zip files
		guidedState.rootFolderFiles = files; // Store all files for reference, but we won't extract yet
		guidedState.zipFiles = zipFileInfos.map((info) => ({
			...info,
			status: MangaProcessingStatus.PENDING
		}));

		isScanning = false;
		onDone();
	}

	function onClick(e: Event) {
		inputElementRef?.click();
	}
</script>

<div class="flex flex-col justify-center items-center gap-4">
	<button
		class="flex flex-col justify-center items-center clickable-hint b-2 border-surface rounded-md p-4 {className} disabled:opacity-50 disabled:cursor-not-allowed"
		onclick={onClick}
		disabled={isScanning}
	>
		<h1 class="font-bold text-app">Select Root Folder</h1>
		<p class="text-sm text-muted">Select the folder containing manga subfolders with .zip files</p>
		<input
			class="hidden"
			bind:this={inputElementRef}
			type="file"
			webkitdirectory={true}
			multiple={true}
			onchange={handleChangeFiles}
		/>
	</button>

	{#if isScanning}
		<div class="flex flex-col justify-center items-center gap-2">
			<div class="animate-spin rounded-full h-8 w-8 outline-dotted outline-5 border-surface"></div>
			<p class="text-sm text-muted">Scanning folder structure...</p>
		</div>
	{/if}

	{#if guidedState.zipFiles.length > 0}
		<div class="flex flex-col gap-2 w-full max-w-2xl">
			<p class="text-sm font-semibold text-app">
				Found {guidedState.zipFiles.length} zip file{guidedState.zipFiles.length === 1 ? '' : 's'}
			</p>
		</div>
	{/if}
</div>

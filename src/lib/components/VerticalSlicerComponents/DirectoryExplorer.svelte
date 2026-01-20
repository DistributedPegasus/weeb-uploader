<script lang="ts">
	import type { SelectedFolder } from '$lib/core/GroupedFolders';
	import DirectoryExplorer from '$lib/components/VerticalSlicerComponents/DirectoryExplorer.svelte';

	interface Props {
		folder: SelectedFolder;
		level?: number;
		class?: string;
	}

	let { folder, level = 0, class: className = '' }: Props = $props();
	let isExpanded = $state(false);

	function toggleExpanded() {
		if (hasContent) {
			isExpanded = !isExpanded;
		}
	}

	const hasContent = folder.files.length > 0 || folder.folders.length > 0;
	const indent = `${level * 5}px`; // px units
</script>

<div class={['select-none', className]}>
	<!-- Folder Header -->
	<button
		type="button"
		class="flex items-center gap-2 py-1 px-2 hover:bg-surface-hover rounded transition-colors w-full text-left"
		style="padding-left: {indent};"
		onclick={toggleExpanded}
		disabled={!hasContent}
	>
		<!-- Expand/Collapse Icon -->
		{#if hasContent}
			<span class="w-4 h-4 flex items-center justify-center">
				{#if isExpanded}
					<span class="i-mdi-chevron-down text-muted"></span>
				{:else}
					<span class="i-mdi-chevron-right text-muted"></span>
				{/if}
			</span>
		{:else}
			<span class="w-4 h-4"></span>
		{/if}

		<!-- Folder Icon -->
		<span class="i-mdi-folder text-blue-500 dark:text-blue-400"></span>

		<!-- Folder Name -->
		<span class="font-medium text-app">
			{folder.name || 'Root'}
		</span>

		<!-- Level Badge -->
		<span
			class="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
		>
			L{folder.level}
		</span>

		<!-- File/Folder Count -->
		<span class="text-sm text-muted ml-auto">
			({folder.files.length} file{folder.files.length !== 1 ? 's' : ''}, {folder.folders.length} folder{folder
				.folders.length !== 1
				? 's'
				: ''})
		</span>
	</button>

	<!-- Expanded Content -->
	{#if isExpanded}
		<div class="ml-4" style="margin-left: {indent};">
			<!-- Subfolders -->
			{#each folder.folders as subfolder}
				<DirectoryExplorer folder={subfolder} level={level + 1} />
			{/each}

			<!-- Files -->
			{#each folder.files as selectedFile}
				<div
					class="flex items-center gap-2 py-1 px-2 hover:bg-surface-hover rounded transition-colors"
					style="padding-left: {indent};"
				>
					<span class="w-4 h-4"></span>
					<span class="i-mdi-file text-muted"></span>
					<span class="text-sm text-app">{selectedFile.file.name}</span>
					<span class="text-xs text-muted ml-auto">
						{(selectedFile.file.size / 1024).toFixed(2)} KB
					</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

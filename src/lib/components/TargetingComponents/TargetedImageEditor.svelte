<script lang="ts">
	import { ChapterPageType } from '$lib/core/GroupedFolders';
	import type { ChapterPageState } from '$lib/core/UploadingState.svelte';

	interface Props {
		pages: ChapterPageState[];
	}

	let { pages: pageStates = $bindable<ChapterPageState[]>([]) }: Props = $props();

	function createImagePreviewUrl(file: File): string {
		return URL.createObjectURL(file);
	}

	function deletePage(pageIndex: number) {
		pageStates[pageIndex].isDeleted = true;
	}

	function restorePage(pageIndex: number) {
		pageStates[pageIndex].isDeleted = false;
	}
</script>

<div class="flex flex-row gap-2 flex-wrap justify-center">
	{#each pageStates as pageState, pageIndex}
		<div class="relative h-48 min-w-48 rounded-lg overflow-hidden">
			{#if pageState.pageType === ChapterPageType.CHAPTER_PAGE}
				<img
					src={createImagePreviewUrl(pageState.pageFile)}
					alt={pageState.pageName}
					class="w-full h-full object-cover"
				/>
			{:else if pageState.pageType === ChapterPageType.CHAPTER_DEFINITION_FILE}
				<div class="w-full h-full i-mdi-file text-white"></div>
			{:else}
				<div class="w-full h-full i-mdi-file-question text-white"></div>
			{/if}

			{#if pageState.isDeleted}
				<div class="absolute inset-0 bg-black/50 flex items-center justify-center">
					<span class="text-white text-sm">Page deleted</span>
				</div>
			{/if}

			<div class="absolute bottom-0 w-full p-2 bg-black/50">
				<span class="text-white text-sm">{pageState.pageName}</span>
			</div>

			{#if !pageState.isDeleted}
				<button
					onclick={() => deletePage(pageIndex)}
					aria-label="Delete page"
					class="btn-danger absolute top-0 right-0 m-2 rounded-full"
				>
					<div class="w-6 h-6 i-mdi-close text-white"></div>
				</button>
			{:else}
				<button
					onclick={() => restorePage(pageIndex)}
					aria-label="Restore page"
					class="btn-success absolute top-0 right-0 m-2 rounded-full"
				>
					<div class="w-6 h-6 i-mdi-restore text-white"></div>
				</button>
			{/if}
		</div>
	{/each}
</div>

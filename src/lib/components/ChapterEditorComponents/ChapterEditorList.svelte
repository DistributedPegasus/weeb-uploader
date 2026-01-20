<script lang="ts">
	import type { ChapterEditorState } from '$lib/core/ChapterEditorState.svelte';
	import { ALL_LANGUAGES_FILTER } from '$lib/core/ChapterEditorState.svelte';
	import { ScanGroup } from '$lib/core/UploadingState.svelte';
	import ChapterEditorItem from './ChapterEditorItem.svelte';
	import DropdownSingleSelector from '../Common/DropdownSingleSelector.svelte';
	import { languages, getLanguageDisplayText } from '../TargetingComponents/LanguageOptions.svelte';

	interface Props {
		editorState: ChapterEditorState;
		availableGroups: ScanGroup[];
	}

	let { editorState, availableGroups }: Props = $props();

	let filteredChapters = $derived(editorState.getFilteredChapters());
</script>

<div class="flex flex-col gap-2">
	<div class="flex flex-row items-center justify-between">
		<h3 class="text-lg font-semibold text-app">
			Chapters
			{#if editorState.selectedLanguageFilter !== ALL_LANGUAGES_FILTER}
				({filteredChapters.length} of {editorState.chapters.length})
			{:else}
				({editorState.chapters.length})
			{/if}
		</h3>
		<div class="flex flex-row gap-2 items-center">
			{#if editorState.getModifiedChapters().length > 0}
				<p class="text-sm text-yellow-500 dark:text-yellow-400">
					{editorState.getModifiedChapters().length} modified
				</p>
			{/if}
			<div class="flex flex-row gap-2 items-center">
				<span class="text-xs text-muted">Filter by Language:</span>
				<DropdownSingleSelector
					items={[ALL_LANGUAGES_FILTER, ...languages.map((l) => l.id)]}
					bind:selectedItem={editorState.selectedLanguageFilter}
					getDisplayText={(id) => {
						if (id === ALL_LANGUAGES_FILTER) return 'All Languages';
						const lang = languages.find((l) => l.id === id);
						return lang ? getLanguageDisplayText(lang) : id;
					}}
					class="text-sm min-w-40"
				/>
			</div>
		</div>
	</div>

	<div class="flex flex-col gap-2 max-h-150 overflow-y-auto">
		{#each filteredChapters as chapter, index}
			<ChapterEditorItem {index} {chapter} {editorState} {availableGroups} />
		{/each}
	</div>
</div>

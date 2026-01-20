<script lang="ts">
	import type { ChapterState } from '$lib/core/UploadingState.svelte';
	import { WarningReason } from '$lib/core/ChapterDumpApplier.svelte';
	import GuidedChapterEditor from './GuidedChapterEditor.svelte';

	interface Props {
		chapters: ChapterState[];
		chaptersWithWarningsCount: number;
		chapterHasWarning: (index: number) => boolean;
		getChapterWarningText: (index: number) => string[] | null;
		getChapterWarningReasons: (index: number) => WarningReason[] | null;
		showOnlyWarnings?: boolean;
		class?: string;
	}

	// Human-readable labels for warning types
	const warningLabels: Record<WarningReason, string> = {
		[WarningReason.NO_GROUPS]: 'No Groups',
		[WarningReason.NO_VALID_GROUPS]: 'No Valid Groups',
		[WarningReason.NO_CHAPTER_INFO]: 'No Chapter Info',
		[WarningReason.NO_MATCHING_GROUP]: 'No Matching Group',
		[WarningReason.VOLUME_MISMATCH]: 'Volume Mismatch',
		[WarningReason.PARTIAL_GROUP_MATCH]: 'Partial Group Match',
		[WarningReason.TITLE_RESOLUTION_NOT_FOUND]: 'Title Resolution Not Found',
		[WarningReason.DUPLICATE_CHAPTER]: 'Duplicate Chapter'
	};

	// All available warning reasons
	const allWarningReasons = Object.values(WarningReason);

	let {
		chapters,
		chaptersWithWarningsCount,
		chapterHasWarning,
		getChapterWarningText,
		getChapterWarningReasons,
		showOnlyWarnings = $bindable(false),
		class: className = ''
	}: Props = $props();

	// State for selected warning types filter
	let selectedWarningTypes = $state<Set<WarningReason>>(new Set());

	// Clear warning filter when "Show only warnings" is unchecked
	$effect(() => {
		if (!showOnlyWarnings) {
			selectedWarningTypes = new Set();
		}
	});

	// Toggle a warning type in the filter
	function toggleWarningType(reason: WarningReason) {
		if (selectedWarningTypes.has(reason)) {
			selectedWarningTypes.delete(reason);
		} else {
			selectedWarningTypes.add(reason);
		}
		selectedWarningTypes = new Set(selectedWarningTypes); // Trigger reactivity
	}

	// Clear all selected warning types
	function clearWarningFilter() {
		selectedWarningTypes = new Set();
	}

	// Check if a chapter matches the current filter
	function chapterMatchesFilter(chapterIndex: number): boolean {
		// If not showing warnings, show all chapters
		if (!showOnlyWarnings && selectedWarningTypes.size === 0) {
			return true;
		}

		// If showing only warnings but no specific types selected, show all chapters with any warning
		if (showOnlyWarnings && selectedWarningTypes.size === 0) {
			return chapterHasWarning(chapterIndex);
		}

		// If specific warning types are selected, check if chapter has any of them
		if (selectedWarningTypes.size > 0) {
			const chapterReasons = getChapterWarningReasons(chapterIndex);
			if (!chapterReasons || chapterReasons.length === 0) {
				return false;
			}
			// Check if any of the chapter's warnings match the selected types
			return chapterReasons.some((reason) => selectedWarningTypes.has(reason));
		}

		return true;
	}

	const filteredChapters = $derived(chapters.filter((_, index) => chapterMatchesFilter(index)));

	// Count chapters for each warning type
	const warningTypeCounts = $derived(() => {
		const counts = new Map<WarningReason, number>();
		chapters.forEach((_, index) => {
			const reasons = getChapterWarningReasons(index);
			if (reasons) {
				reasons.forEach((reason) => {
					counts.set(reason, (counts.get(reason) || 0) + 1);
				});
			}
		});
		return counts;
	});
</script>

<div class="flex flex-col gap-2 {className}">
	<div class="flex flex-col gap-2">
		<div class="flex flex-row justify-between items-center">
			<h3 class="text-lg font-semibold text-app">Detected Chapters ({chapters.length})</h3>
			{#if chaptersWithWarningsCount > 0}
				<label class="flex flex-row gap-2 items-center cursor-pointer">
					<input type="checkbox" bind:checked={showOnlyWarnings} class="rounded" />
					<span class="text-sm text-app">Show only warnings ({chaptersWithWarningsCount})</span>
				</label>
			{/if}
		</div>
		{#if showOnlyWarnings && chaptersWithWarningsCount > 0}
			<div class="flex flex-col gap-2">
				<div class="flex flex-row gap-2 items-center flex-wrap">
					<span class="text-xs text-muted">Filter by warning type:</span>
					{#each allWarningReasons as reason}
						{@const count = warningTypeCounts().get(reason) || 0}
						{#if count > 0}
							<label
								class="flex flex-row gap-1.5 items-center cursor-pointer px-2 py-1 rounded border border-app/30 hover:bg-app/5 {selectedWarningTypes.has(
									reason
								)
									? 'bg-primary/20 border-primary'
									: ''}"
							>
								<input
									type="checkbox"
									checked={selectedWarningTypes.has(reason)}
									onchange={() => toggleWarningType(reason)}
									class="rounded"
								/>
								<span class="text-xs text-app">
									{warningLabels[reason]} ({count})
								</span>
							</label>
						{/if}
					{/each}
					{#if selectedWarningTypes.size > 0}
						<button
							type="button"
							onclick={clearWarningFilter}
							class="text-xs text-muted hover:text-app px-2 py-1 rounded border border-app/30 hover:bg-app/5"
							title="Clear warning type filter"
						>
							Clear filter
						</button>
					{/if}
				</div>
				{#if selectedWarningTypes.size > 0}
					<p class="text-xs text-muted">
						Showing {filteredChapters.length} chapter{filteredChapters.length === 1 ? '' : 's'} with:
						{Array.from(selectedWarningTypes)
							.map((r) => warningLabels[r])
							.join(', ')}
					</p>
				{/if}
			</div>
		{/if}
	</div>
	<div class="flex flex-col gap-2 max-h-150 overflow-y-auto">
		{#if filteredChapters.length === 0 && (showOnlyWarnings || selectedWarningTypes.size > 0)}
			<p class="text-sm text-muted text-center py-4">
				{#if selectedWarningTypes.size > 0}
					No chapters with selected warning types to display
				{:else}
					No chapters with warnings to display
				{/if}
			</p>
		{:else}
			{#each filteredChapters as chapter}
				{@const index = chapters.indexOf(chapter)}
				<GuidedChapterEditor
					{index}
					{chapter}
					hasWarning={chapterHasWarning(index)}
					warningText={getChapterWarningText(index)}
				/>
			{/each}
		{/if}
	</div>
</div>

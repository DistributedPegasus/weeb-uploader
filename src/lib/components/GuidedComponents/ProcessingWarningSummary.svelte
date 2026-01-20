<script lang="ts">
	import { MangaProcessingStep } from './GuidedState.svelte';

	interface Props {
		processingStep: MangaProcessingStep;
		hasSeriesId: boolean;
		duplicateCount: number;
		dumpLookupFailed: boolean;
		dumpLookupFailedGroups: string[];
		dumpLookupFailedTitles: number;
		partialGroupMatchesCount: number;
		chaptersWithNoGroups: number;
		chaptersWithNoValidGroups: number;
		chaptersWithNoChapterInfo: number;
		chaptersWithVolumeMismatch: number;
		class?: string;
	}

	let {
		processingStep,
		hasSeriesId,
		duplicateCount,
		dumpLookupFailed,
		dumpLookupFailedGroups,
		dumpLookupFailedTitles,
		partialGroupMatchesCount,
		chaptersWithNoGroups,
		chaptersWithNoValidGroups,
		chaptersWithNoChapterInfo,
		chaptersWithVolumeMismatch,
		class: className = ''
	}: Props = $props();
</script>

{#if processingStep === MangaProcessingStep.READY_WARNING}
	<div
		class="bg-yellow-500/20 dark:bg-yellow-500/10 border-1 border-yellow-500 rounded-md p-3 {className}"
	>
		{#if !hasSeriesId}
			<p class="text-sm text-yellow-600 dark:text-yellow-400 font-semibold mb-2">
				⚠️ Waiting for series ID - Automation will skip this zip. Please select a series
				above.
			</p>
		{:else}
			<p class="text-sm text-yellow-600 dark:text-yellow-400 font-semibold mb-2">
				⚠️ Ready with warnings - Automation will skip this zip. You can still upload manually.
			</p>
		{/if}
		<div class="flex flex-col gap-1 text-xs text-yellow-700 dark:text-yellow-300">
			{#if duplicateCount > 0}
				<p>
					• {duplicateCount} duplicate chapter{duplicateCount === 1 ? '' : 's'} detected
				</p>
			{/if}
			{#if dumpLookupFailed && dumpLookupFailedGroups.length === 0 && dumpLookupFailedTitles === 0}
				<p>• Chapter dump lookup failed</p>
			{/if}
			{#if dumpLookupFailedGroups.length > 0}
				<p>
					• {dumpLookupFailedGroups.length} group{dumpLookupFailedGroups.length === 1
						? ''
						: 's'} failed to lookup: {dumpLookupFailedGroups.join(', ')}
				</p>
			{/if}
			{#if dumpLookupFailedTitles > 0}
				<p>
					• {dumpLookupFailedTitles} chapter title{dumpLookupFailedTitles === 1 ? '' : 's'} failed
					to resolve
				</p>
			{/if}
			{#if partialGroupMatchesCount > 0}
				<p>
					• {partialGroupMatchesCount} chapter{partialGroupMatchesCount === 1 ? '' : 's'} with
					partial group match (matched 1 group, assigned all groups for release)
				</p>
			{/if}
			{#if chaptersWithNoGroups > 0}
				<p>
					• {chaptersWithNoGroups} chapter{chaptersWithNoGroups === 1 ? '' : 's'} with no groups
					assigned
				</p>
			{/if}
			{#if chaptersWithNoValidGroups > 0}
				<p>
					• {chaptersWithNoValidGroups} chapter{chaptersWithNoValidGroups === 1 ? '' : 's'} with
					no valid groups found
				</p>
			{/if}
			{#if chaptersWithNoChapterInfo > 0}
				<p>
					• {chaptersWithNoChapterInfo} chapter{chaptersWithNoChapterInfo === 1 ? '' : 's'} not
					found in chapter dump
				</p>
			{/if}
			{#if chaptersWithVolumeMismatch > 0}
				<p>
					• {chaptersWithVolumeMismatch} chapter{chaptersWithVolumeMismatch === 1 ? '' : 's'} with
					volume mismatch (volume corrected)
				</p>
			{/if}
		</div>
	</div>
{/if}

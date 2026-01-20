<script lang="ts">
	import type { ChapterState } from '$lib/core/UploadingState.svelte';

	interface Props {
		partialGroupMatches: Array<{ chapter: ChapterState; matchedGroup: string; allGroups: string[] }>;
		class?: string;
	}

	let { partialGroupMatches, class: className = '' }: Props = $props();
</script>

{#if partialGroupMatches.length > 0}
	<div
		class="flex flex-col gap-2 bg-yellow-500/20 dark:bg-yellow-500/10 border-1 border-yellow-500 rounded-md p-4 {className}"
	>
		<div class="flex flex-col gap-1">
			<p class="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
				⚠️ Warning: {partialGroupMatches.length} chapter{partialGroupMatches.length === 1
					? ''
					: 's'} with partial group match
			</p>
			<p class="text-xs text-yellow-700 dark:text-yellow-300">
				The following chapters matched only 1 group from the source, but the release has
				multiple groups. All groups for the release have been assigned automatically.
			</p>
		</div>
		<div class="flex flex-col gap-1 mt-1 max-h-48 overflow-y-auto">
			{#each partialGroupMatches as { chapter, matchedGroup, allGroups }}
				<div
					class="flex flex-row gap-2 items-start text-xs text-yellow-700 dark:text-yellow-300 border-l-2 border-yellow-500 pl-2"
				>
					<div class="flex-1 flex flex-col gap-1">
						<div class="flex flex-row gap-2 items-center">
							<p class="font-medium">
								Vol. {chapter.chapterVolume ?? 'N/A'} Ch. {chapter.chapterNumber ?? 'N/A'} - {chapter.chapterTitle ||
									chapter.originalFolderPath ||
									'Untitled'}
							</p>
						</div>
						<p class="text-xs opacity-75">
							Matched group: <span class="font-semibold">{matchedGroup}</span> | Assigned all
							groups: {allGroups.join(', ')}
						</p>
					</div>
				</div>
			{/each}
		</div>
	</div>
{/if}

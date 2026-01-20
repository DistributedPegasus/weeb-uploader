<script lang="ts">
	import type { ChapterState } from '$lib/core/UploadingState.svelte';

	interface Props {
		duplicateChapters: Array<{ chapter: ChapterState; existingGroups: string[] }>;
		onMarkAllRemoved: () => void;
		onToggleRemoved: (chapter: ChapterState) => void;
		class?: string;
	}

	let { duplicateChapters, onMarkAllRemoved, onToggleRemoved, class: className = '' }: Props =
		$props();
</script>

{#if duplicateChapters.length > 0}
	<div
		class="flex flex-col gap-2 bg-yellow-500/20 dark:bg-yellow-500/10 border-1 border-yellow-500 rounded-md p-4 {className}"
	>
		<div class="flex flex-row justify-between items-center">
			<div class="flex flex-col gap-1">
				<p class="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
					⚠️ Warning: {duplicateChapters.length} duplicate chapter{duplicateChapters.length ===
					1
						? ''
						: 's'} detected
				</p>
				<p class="text-xs text-yellow-700 dark:text-yellow-300">
					The following chapters already exist on WeebDex with matching groups. You can mark
					them as removed to skip uploading.
				</p>
			</div>
			<button
				type="button"
				class="btn-base btn-neutral px-3 py-1 text-sm"
				onclick={onMarkAllRemoved}
				title="Mark all duplicate chapters as removed"
			>
				Removed duplicate chapters
			</button>
		</div>
		<div class="flex flex-col gap-1 mt-1 max-h-48 overflow-y-auto">
			{#each duplicateChapters as { chapter, existingGroups }}
				<div
					class="flex flex-row gap-2 items-start text-xs text-yellow-700 dark:text-yellow-300 border-l-2 border-yellow-500 pl-2 {chapter.isDeleted
						? 'opacity-50'
						: ''}"
				>
					<div class="flex-1 flex flex-col gap-1">
						<div class="flex flex-row gap-2 items-center">
							<p class="font-medium">
								Vol. {chapter.chapterVolume ?? 'N/A'} Ch. {chapter.chapterNumber ?? 'N/A'} - {chapter.chapterTitle ||
									chapter.originalFolderPath ||
									'Untitled'}
							</p>
							{#if chapter.isDeleted}
								<span
									class="px-2 py-0.5 rounded text-xs font-semibold bg-gray-500 text-white"
								>
									Removed
								</span>
							{/if}
						</div>
						<p class="text-xs opacity-75">
							Existing groups: {existingGroups.join(', ')}
						</p>
					</div>
					<button
						type="button"
						class="clickable-hint rounded-md px-2 py-1 text-xs {chapter.isDeleted
							? 'btn-success'
							: 'btn-danger'}"
						onclick={() => onToggleRemoved(chapter)}
						title={chapter.isDeleted ? 'Restore chapter' : 'Mark as removed'}
					>
						{#if chapter.isDeleted}
							<div class="i-mdi-restore h-4 w-4"></div>
						{:else}
							<div class="i-mdi-delete h-4 w-4"></div>
						{/if}
					</button>
				</div>
			{/each}
		</div>
	</div>
{/if}

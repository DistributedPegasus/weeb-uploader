<script lang="ts">
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import type { ChapterState } from '$lib/core/UploadingState.svelte';
	import { getContext } from 'svelte';
	import {
		TargetingState,
		targetingStateContext
	} from '../TargetingComponents/TargetingState.svelte';

	const targetingState = getContext<TargetingState>(targetingStateContext);
	if (!targetingState) {
		throw new Error(
			'BatchGroupAssignment must be used within a component that provides TargetingState context'
		);
	}

	interface Props {
		chapters: ChapterState[];
		onGroupAssigned: () => Promise<void>;
		class?: string;
	}

	let { chapters, onGroupAssigned, class: className = '' }: Props = $props();

	let showBatchAssign = $state(false);
	let batchAssignSelectedGroups = $state<SvelteMap<string, string | null>>(new SvelteMap());
	let batchAssignInProgress = $state<string | null>(null);

	/**
	 * Extracts all unique [XXXXX] patterns from chapter paths
	 */
	function extractBracketPatterns(): Map<string, number> {
		const patternCounts = new Map<string, number>();
		const bracketPatternRegex = /\[([^\]]+)\]$/g;

		for (const chapter of chapters) {
			const path = chapter.originalFolderPath;
			if (!path) continue;

			const matches = path.matchAll(bracketPatternRegex);
			for (const match of matches) {
				const pattern = match[1];
				patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1);
			}
		}

		return patternCounts;
	}

	/**
	 * Gets chapters that match a specific bracket pattern
	 */
	function getChaptersByPattern(pattern: string): ChapterState[] {
		return chapters.filter((chapter) => {
			return chapter.originalFolderPath?.includes(`[${pattern}]`) ?? false;
		});
	}

	/**
	 * Assigns a group to all chapters matching a bracket pattern and re-evaluates warnings
	 */
	async function batchAssignGroupToPattern(pattern: string, groupId: string) {
		batchAssignInProgress = pattern;
		try {
			const matchingChapters = getChaptersByPattern(pattern);
			for (const chapter of matchingChapters) {
				if (!chapter.associatedGroup.groupIds) {
					chapter.associatedGroup.groupIds = [];
				}
				const groupIds = new SvelteSet(chapter.associatedGroup.groupIds);
				if (!groupIds.has(groupId)) {
					groupIds.add(groupId);
					chapter.associatedGroup.groupIds = Array.from(groupIds);
				}
			}

			// Re-evaluate warnings after group assignment
			await onGroupAssigned();
		} finally {
			batchAssignInProgress = null;
		}
	}
</script>

<div class="flex flex-col gap-2 {className}">
	<div class="flex flex-row justify-between items-center">
		<h3 class="text-lg font-semibold text-app">Batch Group Assignment</h3>
		<button
			type="button"
			class="btn-base btn-neutral px-3 py-1 text-sm"
			onclick={() => {
				showBatchAssign = !showBatchAssign;
			}}
		>
			{showBatchAssign ? 'Hide' : 'Show'} Batch Assign
		</button>
	</div>
	<p class="text-sm text-muted">
		Assign groups to multiple chapters based on [XXXXX] patterns found in their paths. Useful
		when groups have been renamed and automatic matching fails.
	</p>
	{#if showBatchAssign}
		{@const bracketPatterns = extractBracketPatterns()}
		{@const sortedPatterns = Array.from(bracketPatterns.entries()).sort(
			(a, b) => b[1] - a[1]
		)}
		{#if sortedPatterns.length === 0}
			<div class="bg-surface rounded-md p-4">
				<p class="text-sm text-muted">No [XXXXX] patterns found in chapter paths.</p>
			</div>
		{:else}
			<div class="bg-surface rounded-md p-4 flex flex-col gap-3">
				<p class="text-sm text-app font-medium">
					Found {sortedPatterns.length} unique pattern{sortedPatterns.length === 1
						? ''
						: 's'}:
				</p>
				<div class="flex flex-col gap-2 max-h-96 overflow-y-auto">
					{#each sortedPatterns as [pattern, count]}
						{@const matchingChapters = getChaptersByPattern(pattern)}
						{@const selectedGroupId = batchAssignSelectedGroups.get(pattern) ?? null}
						<div
							class="flex flex-row gap-3 items-center p-3 bg-surface-hover rounded-md border border-surface"
						>
							<div class="flex-1 flex flex-col gap-1">
								<div class="flex flex-row gap-2 items-center">
									<span class="text-sm font-mono font-semibold text-app">
										[{pattern}]
									</span>
									<span class="text-xs text-muted">
										({count} chapter{count === 1 ? '' : 's'})
									</span>
								</div>
								{#if matchingChapters.length > 0}
									<div class="flex flex-row gap-2 items-center flex-wrap">
										<span class="text-xs text-muted">Current groups:</span>
										{#if (matchingChapters[0].associatedGroup.groupIds?.length ?? 0) > 0}
											{#each matchingChapters[0].associatedGroup.groupIds ?? [] as groupId}
												{@const group = targetingState.availableScanGroups.find(
													(g) => g.groupId === groupId
												)}
												<span
													class="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-600 dark:text-blue-400"
												>
													{group?.groupName ?? groupId}
												</span>
											{/each}
										{:else}
											<span class="text-xs text-muted italic">No groups assigned</span>
										{/if}
									</div>
								{/if}
							</div>
							<div class="flex flex-row gap-2 items-center">
								<select
									value={selectedGroupId ?? ''}
									onchange={(e) => {
										const value = (e.target as HTMLSelectElement).value;
										batchAssignSelectedGroups.set(pattern, value || null);
									}}
									class="bg-surface border border-surface rounded-md px-3 py-1.5 text-sm text-app disabled:opacity-50 disabled:cursor-not-allowed"
									disabled={batchAssignInProgress === pattern}
								>
									<option value="">Select group...</option>
									{#each targetingState.availableScanGroups as group}
										<option value={group.groupId}>{group.groupName}</option>
									{/each}
								</select>
								<button
									type="button"
									class="btn-base btn-primary px-3 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex flex-row gap-2 items-center"
									disabled={!selectedGroupId || batchAssignInProgress === pattern}
									onclick={async () => {
										if (selectedGroupId) {
											await batchAssignGroupToPattern(pattern, selectedGroupId);
											batchAssignSelectedGroups.set(pattern, null);
										}
									}}
								>
									{#if batchAssignInProgress === pattern}
										<div
											class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"
										></div>
										<span>Assigning...</span>
									{:else}
										<span>Assign</span>
									{/if}
								</button>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>

<script lang="ts">
	import { getContext } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { TargetingState, targetingStateContext, searchGroups } from './TargetingState.svelte';
	import { ScanGroup } from '$lib/core/UploadingState.svelte';
	import { CHAPTER_TITLE_EXPORT_RESOLVER } from '$lib/core/ChapterTitleExportResolver.svelte';
	import {
		Coordination,
		Utils,
		ChangeStatus,
		type FailedTitleMatch,
		type ChapterInput,
		WarningReason
	} from '$lib/core/ChapterDumpApplier.svelte';

	enum LookupState {
		IDLE = 'IDLE',
		LOADING = 'LOADING',
		LOADED = 'LOADED',
		ERROR = 'ERROR',
		APPLYING = 'APPLYING',
		ASSIGNING_TITLES = 'ASSIGNING_TITLES'
	}

	const targetingState = getContext<TargetingState>(targetingStateContext);
	if (!targetingState) {
		throw new Error(
			'SeriesChapterDumpLookup must be used within a component that provides TargetingState context'
		);
	}

	let lookupState = $state<LookupState>(LookupState.IDLE);
	let groupCount = $state<number>(0);
	let chapterCount = $state<number>(0);
	let error = $state<string | null>(null);
	let addedGroupsCount = $state<number>(0);
	let failedGroups = $state<string[]>([]);
	let lastProcessedSeriesId = $state<string | null>(null);
	let loadPromise: Promise<void> | null = null;
	let appliedGroupsCount = $state<number>(0);
	let assignedTitlesCount = $state<number>(0);
	let failedTitleMatches = $state<FailedTitleMatch[]>([]);

	$effect(() => {
		(async () => {
			if (targetingState.seriesId) {
				// Only load if this is a different series or we haven't processed this one yet
				if (
					targetingState.seriesId !== lastProcessedSeriesId &&
					lookupState !== LookupState.LOADING
				) {
					await loadChapterData(targetingState.seriesId);
				}
			} else {
				// Reset state when series is cleared
				lookupState = LookupState.IDLE;
				groupCount = 0;
				chapterCount = 0;
				error = null;
				addedGroupsCount = 0;
				failedGroups = [];
				lastProcessedSeriesId = null;
				loadPromise = null;
				appliedGroupsCount = 0;
				assignedTitlesCount = 0;
				failedTitleMatches = [];
			}
		})();
	});

	async function loadChapterData(seriesId: string) {
		// Prevent concurrent executions for the same series
		if (lookupState === LookupState.LOADING && lastProcessedSeriesId === seriesId) {
			return;
		}

		// If there's already a load in progress, wait for it
		if (loadPromise) {
			await loadPromise;
			// After waiting, check if we still need to process this series
			if (lastProcessedSeriesId === seriesId) {
				return;
			}
		}

		lookupState = LookupState.LOADING;
		error = null;
		groupCount = 0;
		chapterCount = 0;
		addedGroupsCount = 0;
		failedGroups = [];
		appliedGroupsCount = 0;
		assignedTitlesCount = 0;
		failedTitleMatches = [];

		// Mark this series as being processed immediately to prevent effect re-triggering
		const currentSeriesId = seriesId;

		loadPromise = (async () => {
			try {
				// Explicitly load the CSV data
				await CHAPTER_TITLE_EXPORT_RESOLVER.load();

				// Check if there are any entries for this series (with or without groups)
				const hasEntries = await CHAPTER_TITLE_EXPORT_RESOLVER.hasSeriesEntries(currentSeriesId);

				if (!hasEntries) {
					// Series not found in dump - set state to IDLE and mark as processed
					// Set lastProcessedSeriesId first to prevent effect from re-triggering
					lastProcessedSeriesId = currentSeriesId;
					lookupState = LookupState.IDLE;
					return;
				}

				// Get all unique group names for this series
				const groupNames = await CHAPTER_TITLE_EXPORT_RESOLVER.getAllGroupNames(currentSeriesId);

				// Get unique volume/chapter combinations to count total chapters
				const volumeChapterCombinations =
					await CHAPTER_TITLE_EXPORT_RESOLVER.getUniqueVolumeChapterCombinations(currentSeriesId);

				lookupState = LookupState.LOADED;
				groupCount = groupNames.length;
				chapterCount = volumeChapterCombinations.length;

				// Clear existing available groups since we have dump data
				targetingState.availableScanGroups = [];

				// Look up each group and add to availableScanGroups
				let addedCount = 0;
				const failed: string[] = [];
				for (const groupName of groupNames) {
					try {
						// Search for the group via API
						const response = await searchGroups(groupName);

						if (!response.data) {
							failed.push(groupName);
							console.warn(`No data found for group "${groupName}"`);
							continue;
						}

						// Find exact match
						const exactMatch = response.data.find((g) => g.name === groupName);

						if (exactMatch) {
							const newGroup = new ScanGroup();
							newGroup.groupId = exactMatch.id;
							newGroup.groupName = exactMatch.name;
							targetingState.availableScanGroups = [
								...targetingState.availableScanGroups,
								newGroup
							];
							addedCount++;
						} else {
							// No exact match found
							failed.push(groupName);
							console.warn(`No exact match found for group "${groupName}"`);
						}
					} catch (err) {
						// Log error but continue with other groups
						failed.push(groupName);
						console.warn(`Failed to lookup group "${groupName}":`, err);
					}
				}

				failedGroups = failed;

				addedGroupsCount = addedCount;
				lastProcessedSeriesId = currentSeriesId;
			} catch (err) {
				lookupState = LookupState.ERROR;
				error = err instanceof Error ? err.message : 'Failed to load chapter data';
				console.error('Error loading chapter data:', err);
			} finally {
				loadPromise = null;
			}
		})();

		await loadPromise;
	}

	async function applyGroupsToChapters() {
		console.log('availableScanGroups:', targetingState.availableScanGroups);
		if (lookupState !== LookupState.LOADED || !targetingState.seriesId) {
			return;
		}

		lookupState = LookupState.APPLYING;
		let appliedCount = 0;

		try {
			// Track group counts before applying
			const beforeCounts = new Map(
				targetingState.chapterStates.map((ch) => [ch, ch.associatedGroup.groupIds?.length ?? 0])
			);

			await Coordination.applyGroupsToChapters(
				targetingState.chapterStates,
				targetingState.availableScanGroups,
				targetingState.seriesId
			);

			// Count how many new groups were added
			for (const chapter of targetingState.chapterStates) {
				const beforeCount = beforeCounts.get(chapter) ?? 0;
				const afterCount = chapter.associatedGroup.groupIds?.length ?? 0;
				appliedCount += Math.max(0, afterCount - beforeCount);
			}

			appliedGroupsCount = appliedCount;
			lookupState = LookupState.LOADED;
		} catch (err) {
			lookupState = LookupState.ERROR;
			error = err instanceof Error ? err.message : 'Failed to apply groups to chapters';
			console.error('Error applying groups to chapters:', err);
		}
	}

	async function applyTitlesToChapters() {
		if (lookupState !== LookupState.LOADED || !targetingState.seriesId) {
			return;
		}

		lookupState = LookupState.ASSIGNING_TITLES;
		const failed: FailedTitleMatch[] = [];

		try {
			// Convert ChapterState objects to ChapterInput for applyChangesFromDump
			const chapterInputs: ChapterInput[] = targetingState.chapterStates.map((chapter) => {
				// Normalize empty strings to null for title (defensive, should already be normalized)
				const normalizedTitle =
					chapter.chapterTitle === undefined || chapter.chapterTitle === null || chapter.chapterTitle === ''
						? null
						: chapter.chapterTitle;
				return {
					chapterVolume: chapter.chapterVolume,
					chapterNumber: chapter.chapterNumber,
					originalFolderPath: chapter.originalFolderPath,
					groupIds: chapter.associatedGroup.groupIds ?? [],
					currentTitle: normalizedTitle
				};
			});

			// Create a map from ChapterInput to ChapterState for applying changes
			const inputToChapterMap = new Map<ChapterInput, (typeof targetingState.chapterStates)[0]>();
			for (let i = 0; i < chapterInputs.length; i++) {
				inputToChapterMap.set(chapterInputs[i], targetingState.chapterStates[i]);
			}

			const isNoGroupChapter = (chapterInput: ChapterInput) => {
				const chapter = inputToChapterMap.get(chapterInput);
				return chapter ? Utils.isNoGroupPath(chapter.originalFolderPath) : false;
			};

			const result = await Coordination.applyChangesFromDump(
				chapterInputs,
				targetingState.availableScanGroups,
				targetingState.seriesId,
				{
					useFallbackMatching: true,
					isNoGroupChapter
				}
			);

			// Apply changes and collect failed matches from results
			for (let i = 0; i < result.results.length; i++) {
				const chapterResult = result.results[i];
				const chapterInput = chapterInputs[i];
				const chapter = inputToChapterMap.get(chapterInput);

				if (!chapter) continue;

				if (
					(chapterResult.status === ChangeStatus.SUCCESS ||
						chapterResult.status === ChangeStatus.NO_CHANGES) &&
					chapterResult.changes
				) {
					const { volume, title, additionalGroupIds } = chapterResult.changes;

					// Apply volume change
					if (volume !== undefined) {
						chapter.chapterVolume = volume;
					}

					// Apply title change
					if (title !== undefined) {
						chapter.chapterTitle = title;
					}

					// Apply group additions
					if (additionalGroupIds.length > 0) {
						const existingGroupIds = new SvelteSet(chapter.associatedGroup.groupIds ?? []);
						for (const groupId of additionalGroupIds) {
							existingGroupIds.add(groupId);
						}
						chapter.associatedGroup.groupIds = Array.from(existingGroupIds);
					}
				} else if (
					chapterResult.status === ChangeStatus.FAILED &&
					chapterResult.warnings.length > 0
				) {
					// Use the first warning's reason for the failure
					failed.push({
						volume: chapterInput.chapterVolume,
						chapter: chapterInput.chapterNumber,
						folderPath: chapterInput.originalFolderPath ?? null,
						reason: chapterResult.warnings[0].reason
					});
				}
			}

			assignedTitlesCount = result.successCount;
			failedTitleMatches = failed;
			lookupState = LookupState.LOADED;
		} catch (err) {
			lookupState = LookupState.ERROR;
			error = err instanceof Error ? err.message : 'Failed to assign titles to chapters';
			console.error('Error assigning titles to chapters:', err);
		}
	}
</script>

<div class="flex flex-col gap-2 bg-surface rounded-md p-4">
	<div class="flex flex-row gap-2 items-center">
		<h3 class="text-sm font-medium text-app">Chapter Dump Lookup</h3>
	</div>

	{#if lookupState === LookupState.LOADING}
		<p class="text-app">Loading chapter data...</p>
	{:else if lookupState === LookupState.ERROR}
		<p class="text-red-500 dark:text-red-400">{error}</p>
	{:else if lookupState === LookupState.IDLE}
		<p class="text-muted">No dumped chapter lookups available.</p>
	{:else if lookupState === LookupState.LOADED || lookupState === LookupState.APPLYING || lookupState === LookupState.ASSIGNING_TITLES}
		<div class="flex flex-col gap-1">
			<p class="text-sm text-app">
				Found {groupCount}
				{groupCount === 1 ? 'group' : 'groups'} and {chapterCount}
				{chapterCount === 1 ? 'chapter' : 'chapters'} in chapter dump.
			</p>
			{#if addedGroupsCount > 0}
				<p class="text-sm text-green-500 dark:text-green-400">
					Added {addedGroupsCount}
					{addedGroupsCount === 1 ? 'group' : 'groups'} to available scan groups.
				</p>
			{/if}
			{#if failedGroups.length > 0}
				<div class="flex flex-col gap-1 mt-2">
					<p class="text-sm text-yellow-500 dark:text-yellow-400 font-semibold">
						Warning: Failed to lookup {failedGroups.length}{' '}
						{failedGroups.length === 1 ? 'group' : 'groups'}:
					</p>
					<ul class="text-sm text-yellow-500 dark:text-yellow-400 list-disc list-inside ml-2">
						{#each failedGroups as failedGroup}
							<li>{failedGroup}</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if lookupState === LookupState.LOADED}
				<div class="flex flex-row gap-2 mt-2">
					<button
						type="button"
						onclick={applyGroupsToChapters}
						class="clickable-hint px-4 py-2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-400 dark:hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors"
					>
						Apply Groups to Chapters
					</button>
					<button
						type="button"
						onclick={applyTitlesToChapters}
						class="clickable-hint px-4 py-2 bg-green-500 hover:bg-green-600 dark:bg-green-400 dark:hover:bg-green-500 text-white rounded-md text-sm font-medium transition-colors"
					>
						Assign Titles to Chapters
					</button>
				</div>
			{:else if lookupState === LookupState.APPLYING}
				<p class="text-app mt-2">Applying groups to chapters...</p>
			{:else if lookupState === LookupState.ASSIGNING_TITLES}
				<p class="text-app mt-2">Assigning titles to chapters...</p>
			{/if}
			{#if appliedGroupsCount > 0}
				<p class="text-sm text-green-500 dark:text-green-400 mt-2">
					Applied {appliedGroupsCount}
					{appliedGroupsCount === 1 ? 'group' : 'groups'} to chapters.
				</p>
			{/if}
			{#if assignedTitlesCount > 0}
				<p class="text-sm text-green-500 dark:text-green-400 mt-2">
					Assigned {assignedTitlesCount}
					{assignedTitlesCount === 1 ? 'title' : 'titles'} to chapters.
				</p>
			{/if}
			{#if failedTitleMatches.length > 0}
				<div class="flex flex-col gap-1 mt-2">
					<p class="text-sm text-yellow-500 dark:text-yellow-400 font-semibold">
						Warning: Unable to assign titles to {failedTitleMatches.length}{' '}
						{failedTitleMatches.length === 1 ? 'chapter' : 'chapters'} (volume and chapter must match
						exactly):
					</p>
					<ul
						class="text-sm text-yellow-500 dark:text-yellow-400 list-disc list-inside ml-2 space-y-1"
					>
						{#each failedTitleMatches as failedMatch}
							<li>
								<span class="font-medium">
									Vol {failedMatch.volume ?? 'N/A'}, Ch {failedMatch.chapter ?? 'N/A'}
								</span>
								{#if failedMatch.folderPath}
									<span class="text-muted"> - {failedMatch.folderPath}</span>
								{/if}
								<span class="text-xs">
									({#if failedMatch.reason === WarningReason.NO_GROUPS}
										No groups assigned
									{:else if failedMatch.reason === WarningReason.NO_CHAPTER_INFO}
										No matching volume/chapter in export
									{:else if failedMatch.reason === WarningReason.NO_MATCHING_GROUP}
										No matching group in export
									{/if})
								</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}
</div>

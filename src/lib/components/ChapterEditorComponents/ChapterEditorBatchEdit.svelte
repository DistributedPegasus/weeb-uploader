<script lang="ts">
	import { getContext } from 'svelte';
	import type { ChapterEditorState, EditableChapter } from '$lib/core/ChapterEditorState.svelte';
	import { ProcessingStep } from '$lib/core/ChapterEditorState.svelte';
	import { ScanGroup } from '$lib/core/UploadingState.svelte';
	import { searchGroups } from '../TargetingComponents/TargetingState.svelte';
	import {
		CHAPTER_TITLE_EXPORT_RESOLVER,
		lookupGroupsFromAPI,
		type ResolvedChapterInfo
	} from '$lib/core/ChapterTitleExportResolver.svelte';
	import { GroupMatcher } from '$lib/core/GroupMatcher.svelte';
	import {
		Coordination,
		Utils,
		ChangeStatus,
		ReleaseLookup,
		type FailedTitleMatch,
		type ChapterInput,
		type Warning,
		WarningReason
	} from '$lib/core/ChapterDumpApplier.svelte';
	import { apiAuthContext, ApiAuthContext } from '$lib/core/GlobalState.svelte';
	import { ALL_LANGUAGES_FILTER } from '$lib/core/ChapterEditorState.svelte';
	import DropdownSingleSelector from '../Common/DropdownSingleSelector.svelte';
	import { languages, getLanguageDisplayText } from '../TargetingComponents/LanguageOptions.svelte';
	import RangeProvider from '../Common/RangeProvider.svelte';
	import { ChapterUploadingGroup } from '$lib/core/UploadingState.svelte';
	import TargetingEditableGroup from '../TargetingComponents/TargetingEditableGroup.svelte';

	enum LookupState {
		IDLE = 'IDLE',
		LOADING = 'LOADING',
		LOADED = 'LOADED',
		ERROR = 'ERROR',
		APPLYING_GROUPS = 'APPLYING_GROUPS',
		ASSIGNING_TITLES = 'ASSIGNING_TITLES',
		FIXING_MISSING_GROUPS = 'FIXING_MISSING_GROUPS'
	}

	interface Props {
		editorState: ChapterEditorState;
		availableGroups: ScanGroup[];
	}

	let { editorState, availableGroups = $bindable<ScanGroup[]>([]) }: Props = $props();

	const authContext = getContext<ApiAuthContext>(apiAuthContext);
	if (!authContext) {
		throw new Error(
			'ChapterEditorBatchEdit must be used within a component that provides ApiAuthContext context'
		);
	}

	interface DetectedGroupMatch {
		detectedName: string;
		matchedGroup: { id: string; name: string } | null;
	}

	let lookupState = $state<LookupState>(LookupState.IDLE);
	let groupCount = $state<number>(0);
	let chapterCount = $state<number>(0);
	let detectedGroups = $state<DetectedGroupMatch[]>([]);
	let error = $state<string | null>(null);
	let addedGroupsCount = $state<number>(0);
	let failedGroups = $state<string[]>([]);
	let lastProcessedSeriesId = $state<string | null>(null);
	let appliedGroupsCount = $state<number>(0);
	let assignedTitlesCount = $state<number>(0);
	let applyingGroupsProgress = $state<{ current: number; total: number } | null>(null);
	let assigningTitlesProgress = $state<{ current: number; total: number } | null>(null);
	let fixingMissingGroupsProgress = $state<{ current: number; total: number } | null>(null);
	let fixedMissingGroupsCount = $state<number>(0);

	let languageValue = $state<string>('en');
	const languageAssignmentRange = $state({
		start: null,
		end: null
	});

	// Volume and Chapter assignment
	let volumeValue = $state<string | null>(null);
	const volumeAssignmentRange = $state({
		start: null,
		end: null
	});

	let chapterValue = $state<string | null>(null);
	const chapterAssignmentRange = $state({
		start: null,
		end: null
	});

	// Title assignment
	let titleValue = $state<string | null>(null);
	const titleAssignmentRange = $state({
		start: null,
		end: null
	});

	// Groups assignment
	let groups = $state<ChapterUploadingGroup>(new ChapterUploadingGroup());
	const groupRange = $state({
		start: null,
		end: null
	});

	// Regex extraction (using chapter title)
	let volumeRegex = $state('Vol\\.? ?(\\d+)');
	let volumeCaseSensitive = $state(false);
	const volumeRegexRange = $state({
		start: null,
		end: null
	});

	let chapterRegex = $state('(?:Ch\\.?|Chapter) ?(\\d+(?:\\.\\d+)?)');
	let chapterCaseSensitive = $state(false);
	const chapterRegexRange = $state({
		start: null,
		end: null
	});

	let failedTitleMatches = $state<FailedTitleMatch[]>([]);

	// Use shared language filter from editorState
	let filteredChapters = $derived(editorState.getFilteredChapters());

	// Main processing pipeline - orchestrates all steps sequentially
	// This effect is reactive to: editorState.seriesId, editorState.processingStep
	$effect(() => {
		(async () => {
			// Explicitly track reactive values to ensure effect re-runs
			const currentSeriesId = editorState.seriesId;
			const currentProcessingStep = editorState.processingStep;

			if (currentSeriesId) {
				const seriesChanged = currentSeriesId !== lastProcessedSeriesId;

				// Reset lookup state if series changed
				if (seriesChanged && lastProcessedSeriesId !== null) {
					lookupState = LookupState.IDLE;
					groupCount = 0;
					chapterCount = 0;
					detectedGroups = [];
					error = null;
					addedGroupsCount = 0;
					failedGroups = [];
					appliedGroupsCount = 0;
					assignedTitlesCount = 0;
					fixedMissingGroupsCount = 0;
					failedTitleMatches = [];
					applyingGroupsProgress = null;
					assigningTitlesProgress = null;
					fixingMissingGroupsProgress = null;
				}

				// Only run pipeline if:
				// 1. This is a different series or we haven't processed this one yet, AND
				// 2. We're not already loading, AND
				// 3. Chapters have been loaded (processingStep is LOADED or ERROR)
				if (
					seriesChanged &&
					lookupState !== LookupState.LOADING &&
					(currentProcessingStep === ProcessingStep.LOADED ||
						currentProcessingStep === ProcessingStep.ERROR)
				) {
					await runProcessingPipeline();
				}
			} else {
				// Reset state when series is cleared
				if (lastProcessedSeriesId !== null) {
					resetState();
				}
			}
		})();
	});

	function resetState() {
		lookupState = LookupState.IDLE;
		groupCount = 0;
		chapterCount = 0;
		detectedGroups = [];
		error = null;
		addedGroupsCount = 0;
		failedGroups = [];
		lastProcessedSeriesId = null;
		appliedGroupsCount = 0;
		assignedTitlesCount = 0;
		fixedMissingGroupsCount = 0;
		failedTitleMatches = [];
		applyingGroupsProgress = null;
		assigningTitlesProgress = null;
		fixingMissingGroupsProgress = null;
	}

	async function runProcessingPipeline() {
		// Capture seriesId at the start to prevent issues if it changes during execution
		const currentSeriesId = editorState.seriesId;
		if (!currentSeriesId) {
			return;
		}

		try {
			// Step 1: Lookup chapters (load chapter dump)
			const shouldContinue = await stepLookupChapters();

			if (!shouldContinue) {
				// stepLookupChapters already set state to IDLE if there are no entries
				return;
			}

			if (!editorState.seriesId || editorState.seriesId !== currentSeriesId) {
				lookupState = LookupState.IDLE;
				return;
			}

			// Step 2: Load groups
			await stepLoadGroups();

			// Pipeline complete - set to LOADED state
			lookupState = LookupState.LOADED;
			lastProcessedSeriesId = currentSeriesId;
		} catch (err) {
			lookupState = LookupState.ERROR;
			error = err instanceof Error ? err.message : 'Failed to load chapter data';
			console.error('Error in processing pipeline:', err);
		}
	}

	// Step 1: Lookup chapters (load chapter dump)
	async function stepLookupChapters(): Promise<boolean> {
		lookupState = LookupState.LOADING;
		error = null;
		groupCount = 0;
		chapterCount = 0;
		detectedGroups = [];
		addedGroupsCount = 0;
		failedGroups = [];
		appliedGroupsCount = 0;
		assignedTitlesCount = 0;
		failedTitleMatches = [];

		// Capture seriesId at the start to prevent issues if it changes during execution
		const currentSeriesId = editorState.seriesId;
		if (!currentSeriesId) {
			lookupState = LookupState.IDLE;
			return false;
		}

		// Explicitly load the CSV data
		await CHAPTER_TITLE_EXPORT_RESOLVER.load();

		// Check if there are any entries for this series (with or without groups)
		const hasEntries = await CHAPTER_TITLE_EXPORT_RESOLVER.hasSeriesEntries(currentSeriesId);

		if (!hasEntries) {
			// Series not found in dump - set state to IDLE and mark as processed
			// Set lastProcessedSeriesId first to prevent effect from re-triggering
			lastProcessedSeriesId = currentSeriesId;
			lookupState = LookupState.IDLE;
			return false;
		}

		// Get all unique group names for this series
		const groupNames = await CHAPTER_TITLE_EXPORT_RESOLVER.getAllGroupNames(currentSeriesId);

		// Get unique volume/chapter combinations to count total chapters
		const volumeChapterCombinations =
			await CHAPTER_TITLE_EXPORT_RESOLVER.getUniqueVolumeChapterCombinations(currentSeriesId);

		groupCount = groupNames.length;
		// Initialize detected groups without matches (will be populated in stepLoadGroups)
		detectedGroups = groupNames.map((name) => ({ detectedName: name, matchedGroup: null }));
		chapterCount = volumeChapterCombinations.length;

		// Return true to indicate we should continue with loading groups
		return true;
	}

	// Step 2: Load groups
	async function stepLoadGroups() {
		// Capture seriesId at the start to prevent issues if it changes during execution
		const currentSeriesId = editorState.seriesId;
		if (!currentSeriesId) return;

		// Check if there are any entries for this series (with or without groups)
		const hasEntries = await CHAPTER_TITLE_EXPORT_RESOLVER.hasSeriesEntries(currentSeriesId);

		if (!hasEntries) {
			console.warn('No entries found in chapter dump for this series');
			return;
		}

		// Get all unique group names for this series
		const groupNames = await CHAPTER_TITLE_EXPORT_RESOLVER.getAllGroupNames(currentSeriesId);

		// If there are no groups, that's fine - it just means all entries are ungrouped
		if (groupNames.length === 0) {
			console.log('No groups found in chapter dump, but series has entries (likely all ungrouped)');
			return;
		}

		// Use the shared utility function to lookup groups
		const result = await lookupGroupsFromAPI(
			groupNames,
			searchGroups,
			availableGroups.map((g) => ({ groupName: g.groupName }))
		);

		// Create a map of detected group names to matched API groups
		const matchedGroupsMap = new Map<string, { id: string; name: string }>();

		// Add successful lookups from API
		for (const group of result.successful) {
			matchedGroupsMap.set(group.name, group);
		}

		// Also check for groups that already exist in availableGroups
		for (const groupName of groupNames) {
			if (!matchedGroupsMap.has(groupName)) {
				const existingGroup = availableGroups.find((g) => g.groupName === groupName);
				if (existingGroup && existingGroup.groupId) {
					matchedGroupsMap.set(groupName, {
						id: existingGroup.groupId,
						name: existingGroup.groupName
					});
				}
			}
		}

		// Update detectedGroups with match information
		detectedGroups = groupNames.map((name) => ({
			detectedName: name,
			matchedGroup: matchedGroupsMap.get(name) ?? null
		}));

		// Add successful lookups to availableGroups
		for (const group of result.successful) {
			// Double-check it's not already in the list (shouldn't happen, but be safe)
			const existingGroup = availableGroups.find((g) => g.groupName === group.name);
			if (!existingGroup) {
				const newGroup = new ScanGroup();
				newGroup.groupId = group.id;
				newGroup.groupName = group.name;
				availableGroups.push(newGroup);
			}
		}

		failedGroups = result.failed;
		addedGroupsCount = result.successful.length;
	}

	async function applyGroupsToChapters() {
		if (lookupState !== LookupState.LOADED || !editorState.seriesId) {
			return;
		}

		lookupState = LookupState.APPLYING_GROUPS;
		let appliedCount = 0;

		// Filter to only English chapters (CSV data only contains English chapters)
		const englishChapters = editorState.chapters.filter((editableChapter) => {
			const currentLanguage =
				editableChapter.modified.language !== undefined
					? editableChapter.modified.language
					: editableChapter.original.language;
			return currentLanguage === 'en';
		});

		const totalChapters = englishChapters.length;
		applyingGroupsProgress = { current: 0, total: totalChapters };

		try {
			// Create a map of group ID to group name for matching
			const groupIdToNameMap = Utils.createGroupIdToNameMap(availableGroups);

			// Iterate through only English chapters
			for (let i = 0; i < englishChapters.length; i++) {
				const editableChapter = englishChapters[i];
				applyingGroupsProgress = { current: i + 1, total: totalChapters };
				const chapter = editableChapter.original;

				// Get current groups assigned to this chapter
				const chapterGroups = chapter.relationships?.groups;
				const defaultGroupIds =
					chapterGroups && Array.isArray(chapterGroups) ? chapterGroups.map((g) => g.id) : [];
				const currentGroupIds = editableChapter.modified.groups ?? defaultGroupIds;

				// Map current group IDs to group names for matching
				const currentGroupNames = currentGroupIds
					.map((id) => groupIdToNameMap.get(id))
					.filter((name): name is string => name !== undefined);

				// Create a ChapterInput object that reflects current modifications
				// Normalize titles: undefined and empty strings become null
				const currentTitleRaw = editableChapter.modified.title ?? chapter.title ?? null;
				const normalizedTitle = currentTitleRaw === '' ? null : (currentTitleRaw ?? null);
				const currentVolumeRaw = editableChapter.modified.volume ?? chapter.volume ?? null;
				const normalizedVolume = currentVolumeRaw === '' ? null : (currentVolumeRaw ?? null);

				const chapterInput: ChapterInput = {
					chapterVolume: normalizedVolume,
					chapterNumber: chapter.chapter,
					originalFolderPath: null, // ChapterEditor doesn't use folder paths
					groupIds: currentGroupIds,
					currentTitle: normalizedTitle,
					language: chapter.language
				};

				// Use ReleaseLookup to find the chapter release (supports partial group matching)
				// This will match even if only one group matches, allowing us to get all groups from the release
				const chapterRelease = await ReleaseLookup.lookupChapterRelease(
					chapterInput,
					editorState.seriesId,
					currentGroupNames,
					{
						useFallbackMatching: true
					}
				);

				if (!chapterRelease) {
					continue;
				}

				// Get all group IDs for this release (handles partial matches by including all groups)
				const allGroupIds = await ReleaseLookup.getAllGroupIdsForRelease(
					editorState.seriesId,
					chapterRelease.release,
					availableGroups
				);

				if (allGroupIds.length === 0) {
					continue;
				}

				// Add new groups that aren't already present
				const currentSet = new Set(currentGroupIds);
				const newGroupIds: string[] = [];
				for (const groupId of allGroupIds) {
					if (!currentSet.has(groupId)) {
						newGroupIds.push(groupId);
						currentSet.add(groupId);
					}
				}

				if (newGroupIds.length > 0) {
					// Update the chapter with new groups
					editorState.updateChapterField(editableChapter.id, 'groups', [
						...currentGroupIds,
						...newGroupIds
					]);
					appliedCount++;
				}
			}

			appliedGroupsCount = appliedCount;
			applyingGroupsProgress = null;
			lookupState = LookupState.LOADED;
		} catch (err) {
			applyingGroupsProgress = null;
			lookupState = LookupState.ERROR;
			error = err instanceof Error ? err.message : 'Failed to apply groups to chapters';
			console.error('Error applying groups to chapters:', err);
		}
	}

	async function fixMissingGroups() {
		if (lookupState !== LookupState.LOADED || !editorState.seriesId) {
			return;
		}

		lookupState = LookupState.FIXING_MISSING_GROUPS;
		let fixedCount = 0;

		// Filter to only English chapters (CSV data only contains English chapters)
		const englishChapters = editorState.chapters.filter((editableChapter) => {
			const currentLanguage =
				editableChapter.modified.language ?? editableChapter.original.language;
			return currentLanguage === 'en';
		});

		// Filter to only chapters with no groups
		const chaptersWithoutGroups = englishChapters.filter((editableChapter) => {
			const chapter = editableChapter.original;
			const chapterGroups = chapter.relationships?.groups;
			const defaultGroupIds =
				chapterGroups && Array.isArray(chapterGroups) ? chapterGroups.map((g) => g.id) : [];
			const currentGroupIds = editableChapter.modified.groups ?? defaultGroupIds;
			return currentGroupIds.length === 0;
		});

		const totalChapters = chaptersWithoutGroups.length;
		fixingMissingGroupsProgress = { current: 0, total: totalChapters };

		try {
			// Iterate through chapters without groups
			for (let i = 0; i < chaptersWithoutGroups.length; i++) {
				const editableChapter = chaptersWithoutGroups[i];
				fixingMissingGroupsProgress = { current: i + 1, total: totalChapters };
				const chapter = editableChapter.original;

				// Get volume and chapter from current modifications or original
				const volumeRaw = editableChapter.modified.volume ?? chapter.volume ?? null;
				const volume = volumeRaw === '' ? null : (volumeRaw ?? null);
				const chapterNum = chapter.chapter;
				const language = editableChapter.modified.language ?? chapter.language;

				// Try to find a unique release by vol/ch (ignoring groups)
				let release: ResolvedChapterInfo | null = null;
				let releaseVolume: string | null = volume;

				// First try by vol/ch
				if (volume !== null && chapterNum !== null) {
					release = await CHAPTER_TITLE_EXPORT_RESOLVER.getUniqueChapterInfo(
						editorState.seriesId,
						volume,
						chapterNum,
						language
					);
				}

				// If that didn't work, try by chapter only (ignoring volume)
				if (!release && chapterNum !== null) {
					const chapterOnlyResult =
						await CHAPTER_TITLE_EXPORT_RESOLVER.getUniqueChapterInfoByChapter(
							editorState.seriesId,
							chapterNum,
							language
						);
					if (chapterOnlyResult) {
						release = chapterOnlyResult.info;
						releaseVolume = chapterOnlyResult.volume;
					}
				}

				if (!release) {
					// No unique match found, skip this chapter
					continue;
				}

				// Get all group IDs for this release
				const allGroupIds = await ReleaseLookup.getAllGroupIdsForRelease(
					editorState.seriesId,
					release,
					availableGroups
				);

				if (allGroupIds.length === 0) {
					// No groups in the release, skip
					continue;
				}

				// Update the chapter with groups
				editorState.updateChapterField(editableChapter.id, 'groups', allGroupIds);

				// Also update volume if it was different (from chapter-only match)
				if (releaseVolume !== null && releaseVolume !== volume) {
					editorState.updateChapterField(editableChapter.id, 'volume', releaseVolume);
				}

				fixedCount++;
			}

			fixedMissingGroupsCount = fixedCount;
			fixingMissingGroupsProgress = null;
			lookupState = LookupState.LOADED;
		} catch (err) {
			fixingMissingGroupsProgress = null;
			lookupState = LookupState.ERROR;
			error = err instanceof Error ? err.message : 'Failed to fix missing groups';
			console.error('Error fixing missing groups:', err);
		}
	}

	async function applyTitlesToChapters() {
		if (lookupState !== LookupState.LOADED || !editorState.seriesId) {
			return;
		}

		lookupState = LookupState.ASSIGNING_TITLES;
		const failed: FailedTitleMatch[] = [];

		// Filter to only English chapters (CSV data only contains English chapters)
		const englishChapters = editorState.chapters.filter((editableChapter) => {
			const currentLanguage =
				editableChapter.modified.language ?? editableChapter.original.language;
			return currentLanguage === 'en';
		});

		const totalChapters = englishChapters.length;
		assigningTitlesProgress = { current: 0, total: totalChapters };

		try {
			// Convert EditableChapter objects to ChapterInput for applyChangesFromDump
			// We'll track the mapping to update the original EditableChapter objects
			const inputToEditableMap = new Map<ChapterInput, EditableChapter>();
			const chapterInputs: ChapterInput[] = [];

			for (const editableChapter of englishChapters) {
				const chapter = editableChapter.original;
				const chapterGroups = chapter.relationships?.groups;
				const defaultGroupIds =
					chapterGroups && Array.isArray(chapterGroups) ? chapterGroups.map((g) => g.id) : [];
				const assignedGroupIds = editableChapter.modified.groups ?? defaultGroupIds;

				// Get current values (modified if exists, otherwise original) and normalize
				// Normalize titles: undefined and empty strings become null
				const currentTitleRaw = editableChapter.modified.title ?? chapter.title ?? null;
				const normalizedTitle = currentTitleRaw === '' ? null : (currentTitleRaw ?? null);

				const currentVolumeRaw = editableChapter.modified.volume ?? chapter.volume ?? null;
				const normalizedVolume = currentVolumeRaw === '' ? null : (currentVolumeRaw ?? null);

				const chapterInput: ChapterInput = {
					chapterVolume: normalizedVolume,
					chapterNumber: chapter.chapter,
					originalFolderPath: null, // ChapterEditor doesn't use folder paths
					groupIds: assignedGroupIds,
					currentTitle: normalizedTitle,
					language: chapter.language
				};

				chapterInputs.push(chapterInput);
				inputToEditableMap.set(chapterInput, editableChapter);
			}

			// Use the centralized applyChangesFromDump function
			// This handles volume fixes, title resolution, and group additions automatically
			const result = await Coordination.applyChangesFromDump(
				chapterInputs,
				availableGroups,
				editorState.seriesId,
				{
					useFallbackMatching: true,
					isNoGroupChapter: () => false // ChapterEditor doesn't use "[no group]" chapters
				}
			);

			// Process results and update EditableChapter objects
			for (let i = 0; i < result.results.length; i++) {
				assigningTitlesProgress = { current: i + 1, total: totalChapters };
				const chapterResult = result.results[i];
				const chapterInput = chapterInputs[i];
				const editableChapter = inputToEditableMap.get(chapterInput);

				if (!editableChapter) {
					continue;
				}

				if (
					(chapterResult.status === ChangeStatus.SUCCESS ||
						chapterResult.status === ChangeStatus.NO_CHANGES) &&
					chapterResult.changes
				) {
					const { volume, title, additionalGroupIds } = chapterResult.changes;
					const chapter = editableChapter.original;

					// Update title only if it's different from the original
					if (title !== undefined) {
						// Normalize empty strings to null (should already be normalized, but defensive check)
						const normalizedTitle = title === null || title === '' ? null : title;
						const originalTitle = chapter.title ?? null;
						// Only update if the normalized title is different from the original
						if (normalizedTitle !== originalTitle) {
							editorState.updateChapterField(editableChapter.id, 'title', normalizedTitle);
						}
					}

					// Update volume only if it's different from the original
					if (volume !== undefined) {
						const originalVolume = chapter.volume ?? null;
						// Only update if the volume is different from the original
						if (volume !== originalVolume) {
							editorState.updateChapterField(editableChapter.id, 'volume', volume);
						}
					}

					// Update groups if they were added
					if (additionalGroupIds.length > 0) {
						const currentGroupIds =
							editableChapter.modified.groups ??
							editableChapter.original.relationships?.groups?.map((g) => g.id) ??
							[];
						const updatedGroupIds = [...currentGroupIds, ...additionalGroupIds];
						editorState.updateChapterField(editableChapter.id, 'groups', updatedGroupIds);
					}
				} else {
					// Collect failed matches
					// Use the first warning's reason if available
					const chapter = editableChapter.original;
					const failureReason =
						chapterResult.warnings.length > 0
							? chapterResult.warnings[0].reason
							: WarningReason.NO_CHAPTER_INFO;
					failed.push({
						volume: chapterInput.chapterVolume,
						chapter: chapterInput.chapterNumber,
						chapterId: chapter.id,
						reason: failureReason
					});
				}
			}

			assignedTitlesCount = result.successCount;
			failedTitleMatches = failed;
			assigningTitlesProgress = null;
			lookupState = LookupState.LOADED;
		} catch (err) {
			assigningTitlesProgress = null;
			lookupState = LookupState.ERROR;
			error = err instanceof Error ? err.message : 'Failed to assign titles to chapters';
			console.error('Error assigning titles to chapters:', err);
		}
	}

	function applyLanguageToRange() {
		const chapters = filteredChapters;
		const start = (languageAssignmentRange.start ?? 1) - 1;
		const end = (languageAssignmentRange.end ?? chapters.length) - 1;
		const language = languageValue?.trim() || 'en';

		for (let i = start; i <= end; i++) {
			const chapter = chapters[i];
			editorState.updateChapterField(chapter.id, 'language', language);
		}
	}

	function applyVolumeToRange() {
		const chapters = filteredChapters;
		const start = (volumeAssignmentRange.start ?? 1) - 1;
		const end = (volumeAssignmentRange.end ?? chapters.length) - 1;
		// Normalize undefined and empty strings to null
		const normalizedVolume =
			volumeValue === undefined || volumeValue === null || volumeValue === ''
				? null
				: volumeValue.trim() || null;

		for (let i = start; i <= end; i++) {
			const chapter = chapters[i];
			const originalVolume = chapter.original.volume ?? null;
			// Only update if the normalized volume is different from the original
			if (normalizedVolume !== originalVolume) {
				editorState.updateChapterField(chapter.id, 'volume', normalizedVolume);
			}
		}
	}

	function applyChapterToRange() {
		const chapters = filteredChapters;
		const start = (chapterAssignmentRange.start ?? 1) - 1;
		const end = (chapterAssignmentRange.end ?? chapters.length) - 1;
		const chapterNum = chapterValue?.trim() || null;

		for (let i = start; i <= end; i++) {
			const chapter = chapters[i];
			editorState.updateChapterField(chapter.id, 'chapter', chapterNum);
		}
	}

	function applyTitleToRange() {
		const chapters = filteredChapters;
		const start = (titleAssignmentRange.start ?? 1) - 1;
		const end = (titleAssignmentRange.end ?? chapters.length) - 1;
		// Normalize undefined and empty strings to null
		const normalizedTitle =
			titleValue === undefined || titleValue === null || titleValue === ''
				? null
				: titleValue.trim() || null;

		for (let i = start; i <= end; i++) {
			const chapter = chapters[i];
			const originalTitle = chapter.original.title ?? null;
			// Only update if the normalized title is different from the original
			if (normalizedTitle !== originalTitle) {
				editorState.updateChapterField(chapter.id, 'title', normalizedTitle);
			}
		}
	}

	function applyGroupsToRange() {
		const chapters = filteredChapters;
		const start = (groupRange.start ?? 1) - 1;
		const end = (groupRange.end ?? chapters.length) - 1;
		const groupIds = groups.groupIds ?? [];

		for (let i = start; i <= end; i++) {
			const chapter = chapters[i];
			editorState.updateChapterField(chapter.id, 'groups', [...groupIds]);
		}
	}

	function appendGroupsToRange() {
		const chapters = filteredChapters;
		const start = (groupRange.start ?? 1) - 1;
		const end = (groupRange.end ?? chapters.length) - 1;
		const groupIds = groups.groupIds ?? [];

		for (let i = start; i <= end; i++) {
			const chapter = chapters[i];
			const currentGroupIds =
				chapter.modified.groups ?? chapter.original.relationships?.groups?.map((g) => g.id) ?? [];
			const newGroups = [...currentGroupIds, ...groupIds];
			const uniqueGroups = [...new Set(newGroups)];
			editorState.updateChapterField(chapter.id, 'groups', uniqueGroups);
		}
	}

	function getChapterTitle(chapter: EditableChapter): string {
		const currentTitle = chapter.modified.title ?? chapter.original.title ?? null;
		return currentTitle === '' ? '' : (currentTitle ?? '');
	}

	function applyVolumeRegex() {
		if (!volumeRegex.trim()) return;

		const chapters = filteredChapters;
		const flags = volumeCaseSensitive ? '' : 'i';
		const regex = new RegExp(volumeRegex, flags);
		const start = (volumeRegexRange.start ?? 1) - 1;
		const end = (volumeRegexRange.end ?? chapters.length) - 1;

		for (let i = start; i <= end; i++) {
			const chapter = chapters[i];
			const title = getChapterTitle(chapter);

			const match = title.match(regex);
			if (match && match[1]) {
				// handle leading zeros
				const volume = match[1].replace(/^0+/, '');
				editorState.updateChapterField(chapter.id, 'volume', volume);
			}
		}
	}

	function applyChapterNumberRegex() {
		if (!chapterRegex.trim()) return;

		const chapters = filteredChapters;
		const flags = chapterCaseSensitive ? '' : 'i';
		const regex = new RegExp(chapterRegex, flags);
		const start = (chapterRegexRange.start ?? 1) - 1;
		const end = (chapterRegexRange.end ?? chapters.length) - 1;

		for (let i = start; i <= end; i++) {
			const chapter = chapters[i];
			const title = getChapterTitle(chapter);

			const match = title.match(regex);
			if (match && match[1]) {
				// handle leading zeros
				const chapterNum = match[1].replace(/^0+/, '');
				editorState.updateChapterField(chapter.id, 'chapter', chapterNum);
			}
		}
	}
</script>

<div class="flex flex-col gap-2 bg-surface rounded-md p-4">
	<div class="flex flex-row gap-2 items-center justify-between">
		<h3 class="text-sm font-medium text-app">Chapter Dump Lookup</h3>
		{#if editorState.selectedLanguageFilter !== ALL_LANGUAGES_FILTER}
			<span class="text-xs text-muted">
				({filteredChapters.length} of {editorState.chapters.length} chapters shown)
			</span>
		{/if}
	</div>

	{#if lookupState === LookupState.LOADING}
		<p class="text-app">Loading chapter data...</p>
	{:else if lookupState === LookupState.ERROR}
		<p class="text-red-500 dark:text-red-400">{error}</p>
	{:else if lookupState === LookupState.IDLE}
		<p class="text-muted">No dumped chapter lookups available.</p>
	{:else if lookupState === LookupState.LOADED || lookupState === LookupState.APPLYING_GROUPS || lookupState === LookupState.ASSIGNING_TITLES || lookupState === LookupState.FIXING_MISSING_GROUPS}
		<div class="flex flex-col gap-1">
			<p class="text-sm text-app">
				Found {groupCount}
				{groupCount === 1 ? 'group' : 'groups'} and {chapterCount}
				{chapterCount === 1 ? 'chapter' : 'chapters'} in chapter dump.
			</p>
			{#if detectedGroups.length > 0}
				<div class="flex flex-col gap-1 mt-2">
					<p class="text-sm text-app font-semibold">
						Detected Groups ({detectedGroups.length}):
						{#if addedGroupsCount > 0}
							<span class="text-green-500 dark:text-green-400 font-normal">
								({addedGroupsCount}
								{addedGroupsCount === 1 ? 'group' : 'groups'} added)
							</span>
						{/if}
					</p>
					<ul class="text-sm text-app list-disc list-inside ml-2 space-y-1">
						{#each detectedGroups as groupMatch}
							<li>
								<span class="font-medium">{groupMatch.detectedName}</span>
								{#if groupMatch.matchedGroup}
									<span class="text-green-500 dark:text-green-400">
										→ {groupMatch.matchedGroup.name} (ID: {groupMatch.matchedGroup.id})
									</span>
								{:else}
									<span class="text-yellow-500 dark:text-yellow-400">→ No match found</span>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if addedGroupsCount > 0 && detectedGroups.length === 0}
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
					<button
						type="button"
						onclick={fixMissingGroups}
						class="clickable-hint px-4 py-2 bg-purple-500 hover:bg-purple-600 dark:bg-purple-400 dark:hover:bg-purple-500 text-white rounded-md text-sm font-medium transition-colors"
					>
						Fix Missing Groups
					</button>
				</div>
			{:else if lookupState === LookupState.APPLYING_GROUPS}
				<p class="text-app mt-2">
					Applying groups to chapters...
					{#if applyingGroupsProgress}
						({applyingGroupsProgress.current} / {applyingGroupsProgress.total})
					{/if}
				</p>
			{:else if lookupState === LookupState.ASSIGNING_TITLES}
				<p class="text-app mt-2">
					Assigning titles to chapters...
					{#if assigningTitlesProgress}
						({assigningTitlesProgress.current} / {assigningTitlesProgress.total})
					{/if}
				</p>
			{:else if lookupState === LookupState.FIXING_MISSING_GROUPS}
				<p class="text-app mt-2">
					Fixing missing groups...
					{#if fixingMissingGroupsProgress}
						({fixingMissingGroupsProgress.current} / {fixingMissingGroupsProgress.total})
					{/if}
				</p>
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
								<span class="text-xs">
									({#if failedMatch.reason === WarningReason.NO_GROUPS}
										No groups assigned
									{:else if failedMatch.reason === WarningReason.NO_VALID_GROUPS}
										No valid groups found
									{:else if failedMatch.reason === WarningReason.NO_CHAPTER_INFO}
										No matching volume/chapter in export
									{:else if failedMatch.reason === WarningReason.NO_MATCHING_GROUP}
										No matching group in export
									{:else}
										Failed to match
									{/if})
								</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Volume Regex Extraction -->
	<form
		onsubmit={(e) => {
			applyVolumeRegex();
			e.preventDefault();
		}}
		class="flex flex-row gap-2 bg-surface rounded-md p-2 items-center justify-between mt-4"
	>
		<div class="flex flex-row gap-2 items-center grow-1">
			<p class="font-bold text-app">Extract Volume from Title (Regex):</p>
			<input
				type="text"
				bind:value={volumeRegex}
				placeholder="Vol\\.? ?(\\d+)"
				class="input-base grow-1"
			/>
		</div>

		<div class="flex flex-row gap-2 items-center">
			<label class="flex flex-row gap-1 items-center whitespace-nowrap mr-3">
				<input type="checkbox" bind:checked={volumeCaseSensitive} class="w-5 h-5" />
				<span class="text-app">Case Sensitive</span>
			</label>

			<RangeProvider
				bind:rangeStart={volumeRegexRange.start}
				bind:rangeEnd={volumeRegexRange.end}
				min={1}
				max={filteredChapters.length}
			/>

			<button type="submit" class="btn-primary rounded-md px-2 py-1"> Apply </button>
		</div>
	</form>

	<!-- Chapter Number Regex Extraction -->
	<form
		onsubmit={(e) => {
			applyChapterNumberRegex();
			e.preventDefault();
		}}
		class="flex flex-row gap-2 bg-surface rounded-md p-2 items-center justify-between"
	>
		<div class="flex flex-row gap-2 items-center grow-1">
			<p class="font-bold text-app">Extract Chapter Number from Title (Regex):</p>
			<input
				type="text"
				bind:value={chapterRegex}
				placeholder="(?:Ch\\.?|Chapter) ?(\\d+(?:\\.\\d+)?)"
				class="input-base grow-1"
			/>
		</div>

		<div class="flex flex-row gap-2 items-center">
			<label class="flex flex-row gap-1 items-center whitespace-nowrap mr-3">
				<input type="checkbox" bind:checked={chapterCaseSensitive} class="w-5 h-5" />
				<span class="text-app">Case Sensitive</span>
			</label>

			<RangeProvider
				bind:rangeStart={chapterRegexRange.start}
				bind:rangeEnd={chapterRegexRange.end}
				min={1}
				max={filteredChapters.length}
			/>

			<button type="submit" class="btn-primary rounded-md px-2 py-1"> Apply </button>
		</div>
	</form>

	<!-- Volume Assignment -->
	<form
		onsubmit={(e) => {
			applyVolumeToRange();
			e.preventDefault();
		}}
		class="flex flex-row gap-2 bg-surface rounded-md p-2 items-center justify-between"
	>
		<div class="flex flex-row gap-2 items-center">
			<p class="font-bold text-app">Assign Volume to All Chapters:</p>
			<input
				type="text"
				bind:value={volumeValue}
				placeholder="Volume number"
				class="input-base min-w-20"
			/>
		</div>

		<div class="flex flex-row gap-2 items-center">
			<RangeProvider
				bind:rangeStart={volumeAssignmentRange.start}
				bind:rangeEnd={volumeAssignmentRange.end}
				min={1}
				max={filteredChapters.length}
			/>

			<button type="submit" class="btn-primary rounded-md px-2 py-1"> Apply </button>
		</div>
	</form>

	<!-- Chapter Number Assignment -->
	<form
		onsubmit={(e) => {
			applyChapterToRange();
			e.preventDefault();
		}}
		class="flex flex-row gap-2 bg-surface rounded-md p-2 items-center justify-between"
	>
		<div class="flex flex-row gap-2 items-center">
			<p class="font-bold text-app">Assign Chapter Number to All Chapters:</p>
			<input
				type="text"
				bind:value={chapterValue}
				placeholder="Chapter number"
				class="input-base min-w-20"
			/>
		</div>

		<div class="flex flex-row gap-2 items-center">
			<RangeProvider
				bind:rangeStart={chapterAssignmentRange.start}
				bind:rangeEnd={chapterAssignmentRange.end}
				min={1}
				max={filteredChapters.length}
			/>

			<button type="submit" class="btn-primary rounded-md px-2 py-1"> Apply </button>
		</div>
	</form>

	<!-- Title Assignment -->
	<form
		onsubmit={(e) => {
			applyTitleToRange();
			e.preventDefault();
		}}
		class="flex flex-row gap-2 bg-surface rounded-md p-2 items-center justify-between"
	>
		<div class="flex flex-row gap-2 items-center">
			<p class="font-bold text-app">Assign Title to All Chapters:</p>
			<input
				type="text"
				bind:value={titleValue}
				placeholder="Chapter title"
				class="input-base min-w-40"
			/>
		</div>

		<div class="flex flex-row gap-2 items-center">
			<RangeProvider
				bind:rangeStart={titleAssignmentRange.start}
				bind:rangeEnd={titleAssignmentRange.end}
				min={1}
				max={filteredChapters.length}
			/>

			<button type="submit" class="btn-primary rounded-md px-2 py-1"> Apply </button>
		</div>
	</form>

	<!-- Groups Assignment -->
	<form
		onsubmit={(e) => {
			applyGroupsToRange();
			e.preventDefault();
		}}
		class="flex flex-row gap-2 bg-surface rounded-md p-2 items-center justify-between"
	>
		<div class="flex flex-row gap-2">
			<p class="font-bold text-app">Assign Groups to All Chapters:</p>
			<TargetingEditableGroup bind:groups />
		</div>

		<div class="flex flex-row gap-2 items-center">
			<RangeProvider
				bind:rangeStart={groupRange.start}
				bind:rangeEnd={groupRange.end}
				min={1}
				max={filteredChapters.length}
			/>

			<button type="submit" class="btn-primary rounded-md px-2 py-1"> Set Group(s) </button>

			<button type="button" class="btn-primary rounded-md px-2 py-1" onclick={appendGroupsToRange}>
				Append Group(s)
			</button>
		</div>
	</form>

	<!-- Language Assignment -->
	<form
		onsubmit={(e) => {
			applyLanguageToRange();
			e.preventDefault();
		}}
		class="flex flex-row gap-2 bg-surface rounded-md p-2 items-center justify-between"
	>
		<div class="flex flex-row gap-2 items-center">
			<p class="font-bold text-app">Assign Language to All Chapters:</p>
			<DropdownSingleSelector
				items={languages.map((l) => l.id)}
				bind:selectedItem={languageValue}
				getDisplayText={(id) => {
					const lang = languages.find((l) => l.id === id);
					return lang ? getLanguageDisplayText(lang) : id;
				}}
				class="text-sm"
			/>
		</div>

		<div class="flex flex-row gap-2 items-center">
			<RangeProvider
				bind:rangeStart={languageAssignmentRange.start}
				bind:rangeEnd={languageAssignmentRange.end}
				min={1}
				max={filteredChapters.length}
			/>

			<button type="submit" class="btn-primary rounded-md px-2 py-1"> Apply </button>
		</div>
	</form>
</div>

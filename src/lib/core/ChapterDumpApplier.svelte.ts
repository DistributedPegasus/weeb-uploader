import { ScanGroup, type ChapterState } from './UploadingState.svelte';
import {
	CHAPTER_TITLE_EXPORT_RESOLVER,
	ChapterTitleExportResolver,
	type ResolvedChapterInfo
} from './ChapterTitleExportResolver.svelte';
import { GroupMatcher } from './GroupMatcher.svelte';
import { SvelteSet, SvelteMap } from 'svelte/reactivity';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Generic chapter representation used for matching and lookup.
 * This interface is independent of any specific chapter implementation.
 */
export interface ChapterInput {
	/**
	 * Chapter volume number (can be null)
	 */
	chapterVolume: string | null;
	/**
	 * Chapter number (can be null)
	 */
	chapterNumber: string | null;
	/**
	 * Original folder path (used for "[no group]" detection)
	 */
	originalFolderPath?: string | null;
	/**
	 * Group IDs assigned to this chapter
	 */
	groupIds: string[];
	/**
	 * Current title of the chapter (used to detect if title changed)
	 * Must be provided - use null when chapter has no title.
	 * Note: For titles, null and empty string are treated as equal (both represent "no title").
	 */
	currentTitle: string | null;
	/**
	 * Language of the chapter (required for exact language matching)
	 */
	language: string;
}

export interface ReleaseMatchResult {
	release: ResolvedChapterInfo;
	volume: string | null;
	usedFallback: boolean;
}

export interface TitleResolutionResult {
	title: string | null;
	matchedGroupName: string | null;
	usedFallback: boolean;
	fallbackVolume: string | null;
	chapterInfo: ResolvedChapterInfo;
}

export interface TitleFromReleaseResult {
	title: string | null;
	matchedGroupName: string | null;
}

/**
 * Represents a matched chapter release with all information needed to apply fixes.
 */
export interface ChapterRelease {
	release: ResolvedChapterInfo;
	volume: string | null;
	usedFallback: boolean;
	title: string | null;
	matchedGroupName: string | null;
}

/**
 * Enum for warning/failure reasons.
 * Used for grouping warnings and identifying failure types.
 */
export enum WarningReason {
	NO_GROUPS = 'no_groups',
	NO_VALID_GROUPS = 'no_valid_groups',
	NO_CHAPTER_INFO = 'no_chapter_info',
	NO_MATCHING_GROUP = 'no_matching_group',
	VOLUME_MISMATCH = 'volume_mismatch',
	PARTIAL_GROUP_MATCH = 'partial_group_match',
	TITLE_RESOLUTION_NOT_FOUND = 'title_resolution_not_found',
	DUPLICATE_CHAPTER = 'duplicate_chapter'
}

/**
 * Status of applying changes to a chapter.
 */
export enum ChangeStatus {
	SUCCESS = 'success',
	NO_CHANGES = 'no_changes',
	FAILED = 'failed'
}

export interface Warning {
	/**
	 * The reason for the warning, used for grouping warnings
	 */
	reason: WarningReason;
	/**
	 * Additional detail/context about the warning (e.g., "changed volume from X to Y")
	 */
	note: string;
}

export interface FailedTitleMatch {
	volume: string | null;
	chapter: string | null;
	folderPath?: string | null;
	chapterId?: string;
	reason: WarningReason;
}

export interface ApplyChangesOptions {
	/**
	 * Whether to use fallback matching by chapter/group (ignoring volume) if exact match fails
	 * When enabled, this will also fix wrong or missing volume numbers based on chapter matching
	 */
	useFallbackMatching?: boolean;
	/**
	 * Callback to check if a chapter is a "[no group]" chapter
	 */
	isNoGroupChapter?: (chapter: ChapterInput) => boolean;
}

/**
 * @deprecated Use ApplyChangesOptions instead
 */
export type TitleApplicationOptions = ApplyChangesOptions;

/**
 * Changes that should be applied to a chapter.
 * Only fields that should be updated are included.
 * If a field is omitted, it means no change should be applied.
 */
export interface ChapterChanges {
	/**
	 * New volume number (if volume should be updated, null means set to null)
	 * Omit this field if volume should not be changed.
	 */
	volume?: string | null;
	/**
	 * New title (if title should be updated, null means set to null)
	 * Omit this field if title should not be changed.
	 */
	title?: string | null;
	/**
	 * Additional group IDs that should be added to the chapter
	 */
	additionalGroupIds: string[];
}

/**
 * Result for a single chapter after applying changes from dump.
 */
export interface ChapterChangeResult {
	/**
	 * Status of the change operation
	 */
	status: ChangeStatus;
	/**
	 * Changes that should be applied to the chapter (only present if status is SUCCESS)
	 */
	changes: ChapterChanges | null;
	/**
	 * Warnings related to this chapter.
	 * Each warning has a reason (for grouping) and a note (for additional detail).
	 */
	warnings: Warning[];
	/**
	 * Title resolution result if successful, null otherwise
	 */
	resolutionResult: TitleResolutionResult | null;
}

/**
 * Result of applying changes from dump to multiple chapters.
 */
export interface ApplyChangesResult {
	/**
	 * Array of results, one per input chapter (in the same order)
	 */
	results: ChapterChangeResult[];
	/**
	 * Number of successfully processed chapters
	 */
	successCount: number;
	/**
	 * Number of failed chapters
	 */
	failedCount: number;
}

/**
 * @deprecated Use ApplyChangesResult instead
 */
export type ApplyTitlesResult = ApplyChangesResult;

// ============================================================================
// Utility Functions
// ============================================================================

export const Utils = {
	/**
	 * Checks if a title has a value.
	 * Note: For titles, null and empty string are treated as equal (both represent "no title").
	 * This only applies to title comparisons, not other string values.
	 * @param title - The title to check (should be normalized to string | null, not undefined)
	 * @returns true if title has a value (not null or empty string), false otherwise
	 */
	hasTitleValue(title: string | null): boolean {
		return title !== null && title !== '';
	},

	/**
	 * Checks if a chapter path contains "[no group]" marker.
	 * @param chapterPath - The chapter folder path to check
	 * @returns true if path contains "[no group]", false otherwise
	 */
	isNoGroupPath(chapterPath: string | null | undefined): boolean {
		return chapterPath?.includes('[no group]') ?? false;
	},

	/**
	 * Checks if a chapter path has groups (i.e., is not a "[no group]" chapter).
	 * @param chapterPath - The chapter folder path to check
	 * @returns true if path has groups (not "[no group]"), false if it's a "[no group]" chapter or path is null/undefined
	 */
	hasGroupsInPath(chapterPath: string | null | undefined): boolean {
		if (!chapterPath) {
			return false;
		}
		return !Utils.isNoGroupPath(chapterPath);
	},

	/**
	 * Creates a map of group ID to group name for quick lookup.
	 * Note: Returns a regular Map (not SvelteMap) for flexibility in non-reactive contexts.
	 * This is intentionally a regular Map as it's used in contexts where reactivity isn't needed.
	 * @param availableScanGroups - Available scan groups from WeebDex API
	 * @returns Map from group ID to group name
	 */
	createGroupIdToNameMap(availableScanGroups: ScanGroup[]): Map<string, string> {
		// Regular Map is intentionally used here for non-reactive contexts (e.g., ChapterEditorBatchEdit)
		// The linter prefers SvelteMap, but regular Map is needed for compatibility
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const groupIdToName = new Map<string, string>();
		for (const group of availableScanGroups) {
			groupIdToName.set(group.groupId, group.groupName);
		}
		return groupIdToName;
	}
};

// ============================================================================
// Release Lookup
// ============================================================================

export const ReleaseLookup = {
	/**
	 * Finds releases (chapter info) for a given volume/chapter combination.
	 * @param seriesId - The series ID
	 * @param volume - The volume number (can be null)
	 * @param chapter - The chapter number (can be null)
	 * @param language - The language to match (required)
	 * @param groupNames - Optional array of group names to filter by
	 * @returns The resolved chapter info, or null if not found
	 */
	async findReleasesForChapter(
		seriesId: string,
		volume: string | null,
		chapter: string | null,
		language: string,
		groupNames: string[] = []
	): Promise<ResolvedChapterInfo | null> {
		if (groupNames.length > 0) {
			return await CHAPTER_TITLE_EXPORT_RESOLVER.getChapterInfoByGroups(
				seriesId,
				volume,
				chapter,
				groupNames,
				language
			);
		} else {
			return await CHAPTER_TITLE_EXPORT_RESOLVER.getChapterInfo(
				seriesId,
				volume,
				chapter,
				language
			);
		}
	},

	/**
	 * Matches a chapter to a release by trying to match with groups from the release to the path of the chapter.
	 * Supports fallback matching by chapter number (ignoring volume) if exact match fails.
	 * @param chapter - The chapter to match
	 * @param seriesId - The series ID
	 * @param groupNames - Group names assigned to the chapter
	 * @param options - Matching options
	 * @returns Release match result with release info, volume, and fallback status, or null if no match
	 */
	async matchChapterToRelease(
		chapter: ChapterInput,
		seriesId: string,
		groupNames: string[],
		options: {
			useFallbackMatching?: boolean;
		} = {}
	): Promise<ReleaseMatchResult | null> {
		const { useFallbackMatching = false } = options;

		console.group('[ChapterDumpApplier] matchChapterToRelease');
		console.log('Input:', {
			seriesId,
			volume: chapter.chapterVolume,
			chapter: chapter.chapterNumber,
			language: chapter.language,
			groupNames,
			useFallbackMatching
		});

		// Try exact match first (volume/chapter/group/language)
		let release = await ReleaseLookup.findReleasesForChapter(
			seriesId,
			chapter.chapterVolume,
			chapter.chapterNumber,
			chapter.language,
			groupNames
		);

		let usedFallback = false;
		let fallbackVolume: string | null = null;

		if (release) {
			console.log('✓ Exact match found:', {
				volume: chapter.chapterVolume,
				chapter: chapter.chapterNumber,
				groups: Object.keys(release.groupTitles)
			});
		} else {
			console.log('✗ Exact match not found');
		}

		// If exact match failed and fallback is enabled, try fallback by chapter/group (ignoring volume)
		if (!release && useFallbackMatching && chapter.chapterNumber) {
			console.log('Attempting fallback matching (ignoring volume)');
			const fallbackResult = await CHAPTER_TITLE_EXPORT_RESOLVER.getChapterInfoByChapterAndGroups(
				seriesId,
				chapter.chapterNumber,
				groupNames,
				chapter.language
			);

			if (fallbackResult) {
				release = fallbackResult.info;
				fallbackVolume = fallbackResult.volume;
				usedFallback = true;
				console.log('✓ Fallback match found:', {
					originalVolume: chapter.chapterVolume,
					fallbackVolume,
					chapter: chapter.chapterNumber,
					groups: Object.keys(release.groupTitles)
				});
			} else {
				console.log('✗ Fallback match also failed');
			}
		}

		if (!release) {
			console.log('✗ No match found for chapter');
			console.groupEnd();
			return null;
		}

		console.log('Result:', {
			usedFallback,
			volume: usedFallback ? fallbackVolume : chapter.chapterVolume
		});
		console.groupEnd();

		return {
			release,
			volume: usedFallback ? fallbackVolume : chapter.chapterVolume,
			usedFallback
		};
	},

	/**
	 * Looks up a chapter release for a given chapter.
	 * This handles matching the chapter to a release, including fallback matching if enabled.
	 * Note: Title resolution is NOT performed here - it should be done after volume and group fixes.
	 * @param chapter - The chapter to look up
	 * @param seriesId - The series ID
	 * @param groupNames - Group names assigned to the chapter
	 * @param options - Options for lookup
	 * @returns ChapterRelease with release and volume info (title will be resolved later), or null if not found
	 */
	async lookupChapterRelease(
		chapter: ChapterInput,
		seriesId: string,
		groupNames: string[],
		options: {
			useFallbackMatching?: boolean;
		} = {}
	): Promise<ChapterRelease | null> {
		const { useFallbackMatching = false } = options;

		// Match chapter to release
		const matchResult = await ReleaseLookup.matchChapterToRelease(chapter, seriesId, groupNames, {
			useFallbackMatching
		});

		if (!matchResult) {
			return null;
		}

		const { release, volume, usedFallback } = matchResult;

		return {
			release,
			volume: usedFallback ? volume : chapter.chapterVolume,
			usedFallback,
			title: null, // Title will be resolved after volume and group fixes
			matchedGroupName: null // Will be resolved after volume and group fixes
		};
	},

	/**
	 * Gets all group IDs for all groups in a release.
	 * This is used when a partial group match occurs (matched 1 group, but release has multiple groups).
	 * @param seriesId - The series ID
	 * @param release - The resolved chapter info from the dump
	 * @param availableScanGroups - Available scan groups from WeebDex API
	 * @returns Array of group IDs for all groups in this release
	 */
	async getAllGroupIdsForRelease(
		seriesId: string,
		release: ResolvedChapterInfo,
		availableScanGroups: ScanGroup[]
	): Promise<string[]> {
		const allGroupsInRelease = Object.keys(release.groupTitles);

		// Get CSV groups for the series
		const csvGroups = await GroupMatcher.getSeriesGroups(seriesId);

		// Map CSV groups to API groups
		const csvToApiGroupMap = GroupMatcher.mapCsvGroupsToApiGroups(csvGroups, availableScanGroups);

		// Get all group IDs for all groups in this release
		const allGroupIds: string[] = [];
		for (const primaryName of allGroupsInRelease) {
			const groupId = csvToApiGroupMap.get(primaryName);
			if (groupId) {
				allGroupIds.push(groupId);
			}
		}

		return allGroupIds;
	}
};

// ============================================================================
// Title Resolution
// ============================================================================

export const TitleResolver = {
	/**
	 * Resolves a chapter title from a matched release.
	 * Tries to match groups from the chapter to groups in the release.
	 * @param release - The matched release/chapter info
	 * @param groupNames - Group names assigned to the chapter
	 * @param isNoGroupChapter - Whether this is a "[no group]" chapter
	 * @returns Title resolution result with title, matched group name, or null if no match
	 */
	resolveTitleFromRelease(
		release: ResolvedChapterInfo,
		groupNames: string[],
		isNoGroupChapter: boolean
	): TitleFromReleaseResult | null {
		console.group('[ChapterDumpApplier] resolveTitleFromRelease');
		console.log('Input:', {
			groupNames,
			isNoGroupChapter,
			availableGroups: Object.keys(release.groupTitles),
			ungroupedTitlesCount: release.ungroupedTitles.length
		});

		// Try to find a matching group title
		let title: string | null = null;
		let matchedGroupName: string | null = null;

		for (const groupName of groupNames) {
			const primaryName = ChapterTitleExportResolver.findGroupPrimaryName(release, groupName);
			if (primaryName && primaryName in release.groupTitles) {
				const rawTitle = release.groupTitles[primaryName];
				// Normalize undefined and empty strings to null
				title = rawTitle === undefined || rawTitle === null || rawTitle === '' ? null : rawTitle;
				matchedGroupName = primaryName;
				console.log('✓ Title resolved from group:', {
					groupName,
					primaryName,
					title
				});
				break;
			}
		}

		// Only use ungrouped title if the chapter path contains "[no group]"
		if (!matchedGroupName && isNoGroupChapter) {
			if (release.ungroupedTitles.length > 0) {
				const rawTitle = release.ungroupedTitles[0];
				// Normalize undefined and empty strings to null
				title = rawTitle === undefined || rawTitle === null || rawTitle === '' ? null : rawTitle;
				console.log('✓ Title resolved from ungrouped titles:', { title });
			}
		}

		// If we found a title (either from group match or ungrouped), return it
		if (title !== null || matchedGroupName !== null) {
			console.log('Result:', { title, matchedGroupName });
			console.groupEnd();
			return { title, matchedGroupName };
		}

		console.log('✗ Title resolution failed - no matching group or ungrouped title');
		console.groupEnd();
		return null;
	},

	/**
	 * Resolves a chapter title from the chapter dump.
	 * This is a convenience function that combines matching and title resolution.
	 * @param chapter - The chapter to resolve title for
	 * @param assignedGroupNames - Group names assigned to the chapter
	 * @param seriesId - The series ID
	 * @param options - Options for title resolution
	 * @returns Title resolution result or null if failed
	 */
	async resolveChapterTitleFromDump(
		chapter: ChapterInput,
		assignedGroupNames: string[],
		seriesId: string,
		options: {
			useFallbackMatching?: boolean;
			isNoGroupChapter?: (chapter: ChapterInput) => boolean;
		} = {}
	): Promise<TitleResolutionResult | null> {
		const { useFallbackMatching = false, isNoGroupChapter } = options;
		const chapterIsNoGroup = isNoGroupChapter?.(chapter) ?? false;

		// Match chapter to release
		const matchResult = await ReleaseLookup.matchChapterToRelease(
			chapter,
			seriesId,
			assignedGroupNames,
			{
				useFallbackMatching
			}
		);

		if (!matchResult) {
			return null;
		}

		const { release, volume, usedFallback } = matchResult;

		// Resolve title from the matched release
		const titleResult = TitleResolver.resolveTitleFromRelease(
			release,
			assignedGroupNames,
			chapterIsNoGroup
		);

		if (!titleResult) {
			// If exact match succeeded but no group match, try fallback if enabled
			if (!usedFallback && useFallbackMatching && chapter.chapterNumber) {
				const fallbackResult = await CHAPTER_TITLE_EXPORT_RESOLVER.getChapterInfoByChapterAndGroups(
					seriesId,
					chapter.chapterNumber,
					assignedGroupNames,
					chapter.language
				);

				if (fallbackResult) {
					const fallbackTitleResult = TitleResolver.resolveTitleFromRelease(
						fallbackResult.info,
						assignedGroupNames,
						chapterIsNoGroup
					);

					if (fallbackTitleResult) {
						// Normalize undefined and empty strings to null
						const normalizedTitle =
							fallbackTitleResult.title === undefined ||
							fallbackTitleResult.title === null ||
							fallbackTitleResult.title === ''
								? null
								: fallbackTitleResult.title;
						return {
							title: normalizedTitle,
							matchedGroupName: fallbackTitleResult.matchedGroupName,
							usedFallback: true,
							fallbackVolume: fallbackResult.volume,
							chapterInfo: fallbackResult.info
						};
					}
				}
			}

			return null;
		}

		// Normalize undefined and empty strings to null
		const normalizedTitle =
			titleResult.title === undefined || titleResult.title === null || titleResult.title === ''
				? null
				: titleResult.title;
		return {
			title: normalizedTitle,
			matchedGroupName: titleResult.matchedGroupName,
			usedFallback,
			fallbackVolume: usedFallback ? volume : null,
			chapterInfo: release
		};
	}
};

// ============================================================================
// Chapter Fixes
// ============================================================================

export const ChapterFixes = {
	/**
	 * Determines if volume should be updated based on the release.
	 * @param currentVolume - The current volume of the chapter (should be normalized to string | null)
	 * @param releaseVolume - The correct volume from the release (should be normalized to string | null)
	 * @returns The new volume if it should be updated, undefined if no change needed (field should be omitted)
	 */
	determineVolumeChange(
		currentVolume: string | null,
		releaseVolume: string | null
	): string | null | undefined {
		// Convert empty string to null for consistency
		const newVolume = releaseVolume === '' ? null : releaseVolume;

		// Only return change if volume actually changed
		if (currentVolume !== newVolume) {
			console.log('Volume change:', {
				current: currentVolume,
				new: newVolume
			});
			return newVolume;
		}

		console.log('No volume change needed:', { current: currentVolume });
		return undefined;
	},

	/**
	 * Determines if title should be updated based on the release.
	 * Note: For titles, null and empty string are treated as equal (both represent "no title").
	 * @param currentTitle - The current title of the chapter (should be normalized to string | null)
	 * @param resolvedTitle - The resolved title from the release (should be normalized to string | null)
	 * @returns The new title if it should be updated, undefined if no change needed (field should be omitted)
	 */
	determineTitleChange(
		currentTitle: string | null,
		resolvedTitle: string | null
	): string | null | undefined {
		// Normalize: convert empty string to null for consistency (defensive, should already be normalized)
		const normalizedCurrent = currentTitle === '' ? null : (currentTitle ?? null);
		const normalizedResolved = resolvedTitle === '' ? null : resolvedTitle;

		// Only return change if title actually changed
		if (normalizedCurrent !== normalizedResolved) {
			console.log('Title change:', {
				current: normalizedCurrent,
				new: normalizedResolved
			});
			return normalizedResolved;
		}

		console.log('No title change needed:', { current: normalizedCurrent });
		return undefined;
	},

	/**
	 * Gets all group IDs that should be added to a chapter from a release.
	 * This is used when a partial group match occurred (matched 1 group, but release has multiple groups).
	 * @param currentGroupIds - Current group IDs assigned to the chapter
	 * @param seriesId - The series ID
	 * @param release - The release/chapter info
	 * @param availableScanGroups - Available scan groups from WeebDex API
	 * @param matchedGroupName - The group name that was matched
	 * @returns Array of additional group IDs that should be added, empty array if none
	 */
	async getAdditionalGroupsFromRelease(
		currentGroupIds: string[],
		seriesId: string,
		release: ResolvedChapterInfo,
		availableScanGroups: ScanGroup[],
		matchedGroupName: string | null
	): Promise<string[]> {
		if (!matchedGroupName) {
			return [];
		}

		const allGroupsInRelease = Object.keys(release.groupTitles);

		// Check if we only matched 1 group but there are more groups for this release
		if (allGroupsInRelease.length > 1) {
			const allGroupIds = await ReleaseLookup.getAllGroupIdsForRelease(
				seriesId,
				release,
				availableScanGroups
			);

			// Return only the group IDs that aren't already present
			const existingSet = new SvelteSet(currentGroupIds);
			return allGroupIds.filter((groupId) => !existingSet.has(groupId));
		}

		return [];
	},

	/**
	 * Calculates all changes that should be applied to a chapter from a release.
	 * This includes:
	 * 1. Correcting volume number if it differs from the release
	 * 2. Adding groups from release if partial match occurred
	 * 3. Resolving the title (after volume and group fixes)
	 * Only fields that actually changed are included in the returned changes.
	 * @param chapter - The chapter input (includes current values for comparison)
	 * @param chapterRelease - The matched chapter release with release and volume info
	 * @param availableScanGroups - Available scan groups from WeebDex API
	 * @param seriesId - The series ID
	 * @param groupNames - Group names assigned to the chapter (before potential group additions)
	 * @param isNoGroupChapter - Whether this is a "[no group]" chapter
	 * @returns ChapterChanges object with only the fields that actually changed
	 */
	async calculateChangesFromRelease(
		chapter: ChapterInput,
		chapterRelease: ChapterRelease,
		availableScanGroups: ScanGroup[],
		seriesId: string,
		groupNames: string[],
		isNoGroupChapter: boolean
	): Promise<ChapterChanges> {
		const { release, volume } = chapterRelease;

		console.group('[ChapterDumpApplier] calculateChangesFromRelease');
		console.log('Input:', {
			volume: chapter.chapterVolume,
			chapter: chapter.chapterNumber,
			currentTitle: chapter.currentTitle,
			currentGroups: chapter.groupIds,
			releaseVolume: volume,
			releaseGroups: Object.keys(release.groupTitles)
		});

		// Step 1: Determine volume change
		console.group('Step 1: Volume Change');
		const volumeChange = ChapterFixes.determineVolumeChange(chapter.chapterVolume, volume);
		console.groupEnd();

		// Step 2: Determine group additions from release if partial match occurred
		// First, we need to resolve the title to get matchedGroupName, but we'll do a preliminary resolution
		// with current groups to determine which group was matched
		console.group('Step 2: Preliminary Title Resolution (for group matching)');
		const preliminaryTitleResult = TitleResolver.resolveTitleFromRelease(
			release,
			groupNames,
			isNoGroupChapter
		);
		console.groupEnd();

		// Get additional groups if we matched a group and there are multiple groups in the release
		let additionalGroupIds: string[] = [];
		if (preliminaryTitleResult?.matchedGroupName) {
			console.group('Step 3: Additional Groups Check');
			console.log('Checking for additional groups:', {
				matchedGroup: preliminaryTitleResult.matchedGroupName,
				allGroupsInRelease: Object.keys(release.groupTitles)
			});
			additionalGroupIds = await ChapterFixes.getAdditionalGroupsFromRelease(
				chapter.groupIds,
				seriesId,
				release,
				availableScanGroups,
				preliminaryTitleResult.matchedGroupName
			);
			if (additionalGroupIds.length > 0) {
				console.log('Additional groups to add:', additionalGroupIds);
			} else {
				console.log('No additional groups to add');
			}
			console.groupEnd();
		}

		// Step 4: Resolve title from the release (after volume and group fixes)
		// Get updated group names after potential group additions
		const updatedGroupIds = [...chapter.groupIds, ...additionalGroupIds];
		const groupIdToNameMap = Utils.createGroupIdToNameMap(availableScanGroups);
		const updatedGroupNames = updatedGroupIds
			.map((id) => groupIdToNameMap.get(id))
			.filter((name): name is string => name !== undefined);

		// Use updated group names for final title resolution
		const finalGroupNames = updatedGroupNames.length > 0 ? updatedGroupNames : groupNames;
		console.group('Step 4: Final Title Resolution');
		const titleResult = TitleResolver.resolveTitleFromRelease(
			release,
			finalGroupNames,
			isNoGroupChapter
		);
		console.groupEnd();

		// Update chapterRelease with final title resolution
		// Normalize undefined and empty strings to null
		const rawResolvedTitle = titleResult?.title ?? null;
		const resolvedTitle =
			rawResolvedTitle === undefined || rawResolvedTitle === null || rawResolvedTitle === ''
				? null
				: rawResolvedTitle;
		if (titleResult) {
			chapterRelease.title = resolvedTitle;
			chapterRelease.matchedGroupName = titleResult.matchedGroupName;
		} else {
			chapterRelease.title = null;
			chapterRelease.matchedGroupName = null;
		}

		// Step 5: Determine title change by comparing current title with resolved title
		// Normalize currentTitle to ensure it's string | null (defensive, should already be normalized)
		const normalizedCurrentTitle =
			chapter.currentTitle === undefined ||
			chapter.currentTitle === null ||
			chapter.currentTitle === ''
				? null
				: chapter.currentTitle;
		console.group('Step 5: Title Change Detection');
		const titleChange = ChapterFixes.determineTitleChange(normalizedCurrentTitle, resolvedTitle);
		console.groupEnd();

		// Only include fields that actually changed
		const changes: ChapterChanges = {
			additionalGroupIds
		};
		if (volumeChange !== undefined) {
			changes.volume = volumeChange;
		}
		if (titleChange !== undefined) {
			changes.title = titleChange;
		}

		console.log('Final Changes:', {
			volumeChange: changes.volume !== undefined ? changes.volume : 'none',
			titleChange: changes.title !== undefined ? changes.title : 'none',
			additionalGroups: changes.additionalGroupIds.length
		});
		console.groupEnd();

		return changes;
	}
};

// ============================================================================
// Coordination Functions
// ============================================================================

export const Coordination = {
	/**
	 * Applies groups from the chapter dump CSV to chapters by matching folder paths.
	 * @param chapters - Array of chapters to apply groups to
	 * @param availableScanGroups - Available scan groups from WeebDex API
	 * @param seriesId - The series ID
	 * @returns Array of chapters that had groups applied
	 */
	async applyGroupsToChapters(
		chapters: ChapterState[],
		availableScanGroups: ScanGroup[],
		seriesId: string
	): Promise<ChapterState[]> {
		// Get CSV groups for the series
		const csvGroups = await GroupMatcher.getSeriesGroups(seriesId);

		// Match and associate groups to chapters
		const associations = await GroupMatcher.matchAndAssociateGroupsToChapters(
			chapters,
			availableScanGroups,
			csvGroups,
			seriesId
		);

		// Apply matched group IDs to chapters
		const updatedChapters: ChapterState[] = [];
		for (const association of associations) {
			const existingGroupIds = association.chapter.associatedGroup.groupIds ?? [];
			const existingSet = new SvelteSet(existingGroupIds);

			// Preserve original order, then append new groupIds in their original order
			const result = [...existingGroupIds];

			for (const groupId of association.groupIds) {
				if (!existingSet.has(groupId)) {
					existingSet.add(groupId);
					result.push(groupId);
				}
			}

			association.chapter.associatedGroup.groupIds = result;
			updatedChapters.push(association.chapter);
		}

		return updatedChapters;
	},

	/**
	 * Determines changes that should be applied to chapters from the chapter dump.
	 * This is a coordination function that:
	 * 1. Looks up chapter releases for each chapter
	 * 2. Determines fixes (volume, title, groups) that should be applied from the releases
	 * @param chapters - Array of chapter inputs to process
	 * @param availableScanGroups - Available scan groups from WeebDex API
	 * @param seriesId - The series ID
	 * @param options - Options for applying changes
	 * @returns Result with array of chapter results, success and failure counts
	 */
	async applyChangesFromDump(
		chapters: ChapterInput[],
		availableScanGroups: ScanGroup[],
		seriesId: string,
		options: ApplyChangesOptions = {}
	): Promise<ApplyChangesResult> {
		console.group('[ChapterDumpApplier] applyChangesFromDump');
		console.log('Input:', {
			seriesId,
			chapterCount: chapters.length,
			availableGroupsCount: availableScanGroups.length,
			useFallbackMatching: options.useFallbackMatching ?? false
		});

		// Create a map of group ID to group name for quick lookup
		const groupIdToNameMap = Utils.createGroupIdToNameMap(availableScanGroups);
		const groupIdToName = new SvelteMap<string, string>();
		for (const [id, name] of groupIdToNameMap) {
			groupIdToName.set(id, name);
		}

		const { isNoGroupChapter } = options;

		const results: ChapterChangeResult[] = [];
		let successCount = 0;
		let failedCount = 0;

		for (let i = 0; i < chapters.length; i++) {
			const chapter = chapters[i];
			console.groupCollapsed(`Chapter ${i + 1}/${chapters.length}`);
			console.log('Input:', {
				volume: chapter.chapterVolume,
				chapter: chapter.chapterNumber,
				groupIds: chapter.groupIds,
				path: chapter.originalFolderPath
			});
			const chapterIsNoGroup = isNoGroupChapter?.(chapter) ?? false;
			const assignedGroupIds = chapter.groupIds ?? [];
			const warnings: Warning[] = [];

			// Check if no groups assigned (unless it's a "[no group]" chapter)
			if (assignedGroupIds.length === 0 && !chapterIsNoGroup) {
				console.log('✗ Failed: No groups assigned');
				results.push({
					status: ChangeStatus.FAILED,
					changes: null,
					warnings: [
						{
							reason: WarningReason.NO_GROUPS,
							note: 'Unable to assign any of the required groups to the chapter'
						}
					],
					resolutionResult: null
				});
				failedCount++;
				console.groupEnd();
				continue;
			}

			// Map group IDs to group names
			const assignedGroupNames = assignedGroupIds
				.map((id) => groupIdToName.get(id))
				.filter((name): name is string => name !== undefined);

			// Check if no valid groups found (unless it's a "[no group]" chapter)
			if (assignedGroupNames.length === 0 && !chapterIsNoGroup) {
				console.log('✗ Failed: No valid groups found', {
					assignedGroupIds,
					availableGroupIds: Array.from(groupIdToName.keys())
				});
				results.push({
					status: ChangeStatus.FAILED,
					changes: null,
					warnings: [
						{
							reason: WarningReason.NO_VALID_GROUPS,
							note: 'No valid groups found for assigned group IDs'
						}
					],
					resolutionResult: null
				});
				failedCount++;
				console.groupEnd();
				continue;
			}

			// Step 1: Look up the chapter release (matching only, no title resolution yet)
			const chapterRelease = await ReleaseLookup.lookupChapterRelease(
				chapter,
				seriesId,
				assignedGroupNames,
				{
					useFallbackMatching: options.useFallbackMatching
				}
			);

			if (!chapterRelease) {
				console.log('✗ Failed: Not found in chapter dump');
				results.push({
					status: ChangeStatus.FAILED,
					changes: null,
					warnings: [
						{
							reason: WarningReason.NO_CHAPTER_INFO,
							note: 'Chapter not found in chapter dump'
						}
					],
					resolutionResult: null
				});
				failedCount++;
				console.groupEnd();
				continue;
			}

			console.log('✓ Release found:', {
				usedFallback: chapterRelease.usedFallback,
				releaseVolume: chapterRelease.volume
			});

			// Store original volume before fixes (for volume mismatch warning)
			const originalVolume = chapter.chapterVolume;

			// Step 2: Calculate changes from the release
			// This will determine volume changes, group additions, and title resolution (in that order)
			const changes = await ChapterFixes.calculateChangesFromRelease(
				chapter,
				chapterRelease,
				availableScanGroups,
				seriesId,
				assignedGroupNames,
				chapterIsNoGroup
			);

			// Convert ChapterRelease to TitleResolutionResult
			// Normalize undefined and empty strings to null (defensive check, should already be normalized)
			const normalizedTitle =
				chapterRelease.title === undefined ||
				chapterRelease.title === null ||
				chapterRelease.title === ''
					? null
					: chapterRelease.title;
			const resolutionResult: TitleResolutionResult = {
				title: normalizedTitle,
				matchedGroupName: chapterRelease.matchedGroupName,
				usedFallback: chapterRelease.usedFallback,
				fallbackVolume: chapterRelease.usedFallback ? chapterRelease.volume : null,
				chapterInfo: chapterRelease.release
			};

			// Generate warnings based on the resolution result
			if (resolutionResult.usedFallback && resolutionResult.fallbackVolume !== null) {
				const originalVolumeStr = originalVolume ?? 'N/A';
				const newVolumeStr =
					resolutionResult.fallbackVolume === '' || resolutionResult.fallbackVolume === null
						? 'N/A'
						: resolutionResult.fallbackVolume;
				warnings.push({
					reason: WarningReason.VOLUME_MISMATCH,
					note: `Changed volume from ${originalVolumeStr} to ${newVolumeStr}`
				});
			}

			if (resolutionResult.matchedGroupName) {
				const allGroupsInChapter = Object.keys(resolutionResult.chapterInfo.groupTitles);
				if (allGroupsInChapter.length > 1) {
					warnings.push({
						reason: WarningReason.PARTIAL_GROUP_MATCH,
						note: `Matched "${resolutionResult.matchedGroupName}" but release has ${allGroupsInChapter.length} groups: ${allGroupsInChapter.join(', ')}`
					});
				}
			}

			// Check if there are actually any changes to apply
			const hasChanges =
				changes.volume !== undefined ||
				changes.title !== undefined ||
				changes.additionalGroupIds.length > 0;

			const status = hasChanges ? ChangeStatus.SUCCESS : ChangeStatus.NO_CHANGES;
			console.log('Result:', {
				status,
				warningsCount: warnings.length,
				warnings: warnings.map((w) => w.reason),
				hasTitle: resolutionResult.title !== null,
				hasVolumeChange: changes.volume !== undefined,
				hasTitleChange: changes.title !== undefined,
				additionalGroupsCount: changes.additionalGroupIds.length
			});

			results.push({
				status,
				changes,
				warnings,
				resolutionResult
			});
			successCount++;
			console.groupEnd();
		}

		console.log('Summary:', {
			total: chapters.length,
			successCount,
			failedCount
		});
		console.groupEnd();

		return { results, successCount, failedCount };
	}
};

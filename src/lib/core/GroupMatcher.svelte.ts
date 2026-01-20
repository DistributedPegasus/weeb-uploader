import type { ChapterState } from './UploadingState.svelte';
import { ScanGroup } from './UploadingState.svelte';
import {
	CHAPTER_TITLE_EXPORT_RESOLVER,
	ChapterTitleExportResolver,
	type Group,
	type ResolvedChapterInfo
} from './ChapterTitleExportResolver.svelte';
import { SvelteMap } from 'svelte/reactivity';

export interface GroupMatchResult {
	matchedGroupIds: string[];
	matchedGroupNames: string[];
	unmatchedGroups: Group[];
}

export interface ChapterGroupAssociation {
	chapter: ChapterState;
	groupIds: string[];
	matchedGroups: string[];
	unmatchedGroups: string[];
}

export class GroupMatcher {
	/**
	 * Gets all groups present in the chapter dump for a series.
	 * @param seriesId - The series ID
	 * @returns Array of Group objects from the chapter dump
	 */
	static async getSeriesGroups(seriesId: string): Promise<Group[]> {
		return await CHAPTER_TITLE_EXPORT_RESOLVER.getAllGroups(seriesId);
	}

	/**
	 * Matches a group name (primary or alt) to a Group from the chapter dump.
	 * @param groups - Array of groups to search
	 * @param groupName - The group name to match (can be primary or alt name)
	 * @returns The matching Group, or null if not found
	 */
	static findMatchingGroup(groups: Group[], groupName: string): Group | null {
		for (const group of groups) {
			if (ChapterTitleExportResolver.groupMatches(group, groupName)) {
				return group;
			}
		}
		return null;
	}

	/**
	 * Matches CSV groups to WeebDex API groups (ScanGroup) by name.
	 * Checks both primary names and alt names using exact, case-sensitive matching.
	 * @param csvGroups - Groups from the chapter dump
	 * @param apiGroups - Groups from WeebDex API (ScanGroup)
	 * @returns Map from CSV group primary names to WeebDex group IDs
	 */
	static mapCsvGroupsToApiGroups(
		csvGroups: Group[],
		apiGroups: ScanGroup[]
	): SvelteMap<string, string> {
		const mapping = new SvelteMap<string, string>();

		for (const csvGroup of csvGroups) {
			// Try to find matching API group by checking if API group name matches CSV group
			// (checking both primary name and alt names of CSV group)
			const matchedApiGroup = apiGroups.find((apiGroup) => {
				return ChapterTitleExportResolver.groupMatches(csvGroup, apiGroup.groupName);
			});

			if (matchedApiGroup) {
				mapping.set(csvGroup.primaryName, matchedApiGroup.groupId);
			}
		}

		return mapping;
	}

	/**
	 * Checks if a group's name (primary or alt) appears in a string using substring matching.
	 * Group names are normalized by replacing "/" with "-" to match path format.
	 * Only checks within the last bracket section (e.g., [XXXXX]) of the string.
	 * @param group - The group to check
	 * @param searchString - The string to search in
	 * @returns true if the group's primary name or any alt name appears in the last bracket section
	 */
	private static groupNameInString(group: Group, searchString: string): boolean {
		// Extract the last bracket section from the string (using $ to match at end)
		const lastBracketMatch = searchString.match(/\[([^\]]+)\]$/);
		if (!lastBracketMatch) {
			// If there's no bracket section, no match
			return false;
		}

		const lastBracketContent = lastBracketMatch[1];

		// Normalize primary name by replacing "/" and ":" with "-" (paths convert "/" to "-")
		const normalizedPrimaryName = group.primaryName.replace(/[\\/\\:\\*]/g, '-');
		if (lastBracketContent === normalizedPrimaryName) {
			return true;
		}

		// Check normalized alt names
		for (const altName of group.altNames) {
			const normalizedAltName = altName.replace(/[\\/\\:\\*]/g, '-');
			if (lastBracketContent === normalizedAltName) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Matches groups from ResolvedChapterInfo against a string (e.g., chapter path).
	 * Checks both primary names and alt names using substring matching.
	 * @param chapterInfo - Resolved chapter info containing groups
	 * @param searchString - The string to search for group names in
	 * @returns The first matching Group, or null if no match
	 */
	static findGroupInString(
		chapterInfo: ResolvedChapterInfo,
		searchString: string | null | undefined
	): Group | null {
		if (!searchString) {
			return null;
		}

		for (const group of chapterInfo.groups) {
			if (this.groupNameInString(group, searchString)) {
				return group;
			}
		}

		return null;
	}

	/**
	 * Matches groups to a chapter based on the chapter's folder path.
	 * Checks both primary names and alt names.
	 * @param chapter - The chapter to match groups for
	 * @param groups - Array of groups to match against
	 * @returns Array of matching Group objects
	 */
	static matchGroupsToChapter(chapter: ChapterState, groups: Group[]): Group[] {
		if (!chapter.originalFolderPath) {
			return [];
		}

		const matchingGroups: Group[] = [];

		for (const group of groups) {
			if (this.groupNameInString(group, chapter.originalFolderPath)) {
				matchingGroups.push(group);
			}
		}

		return matchingGroups;
	}

	/**
	 * Associates a chapter with WeebDex group IDs based on CSV groups and API groups.
	 * Preserves the order of groups as they appear in the chapter dump.
	 * @param chapter - The chapter to associate groups with
	 * @param chapterInfo - Resolved chapter info from CSV (groups are in chapter dump order)
	 * @param csvGroups - All groups from the chapter dump for the series
	 * @param csvToApiGroupMap - Map from CSV group primary names to WeebDex group IDs
	 * @returns GroupMatchResult with matched and unmatched groups (in chapter dump order)
	 */
	static associateChapterWithGroups(
		chapter: ChapterState,
		chapterInfo: ResolvedChapterInfo | null,
		csvGroups: Group[],
		csvToApiGroupMap: SvelteMap<string, string>
	): GroupMatchResult {
		if (!chapterInfo) {
			return {
				matchedGroupIds: [],
				matchedGroupNames: [],
				unmatchedGroups: []
			};
		}

		// Preserve order from chapterInfo.groups (which maintains chapter dump order)
		const matchedGroupIds: string[] = [];
		const matchedGroupNames: string[] = [];
		const unmatchedGroups: Group[] = [];

		// Iterate through groups in the order they appear in the chapter dump
		for (const group of chapterInfo.groups) {
			const apiGroupId = csvToApiGroupMap.get(group.primaryName);
			if (apiGroupId) {
				// Maintain order: matched groups are added in the same order as chapterInfo.groups
				matchedGroupIds.push(apiGroupId);
				matchedGroupNames.push(group.primaryName);
			} else {
				// Unmatched groups also maintain order
				unmatchedGroups.push(group);
			}
		}

		return {
			matchedGroupIds,
			matchedGroupNames,
			unmatchedGroups
		};
	}

	/**
	 * Associates multiple chapters with WeebDex group IDs.
	 * @param chapters - Array of chapters to associate
	 * @param seriesId - The series ID
	 * @param csvGroups - All groups from the chapter dump for the series
	 * @param apiGroups - Groups from WeebDex API
	 * @returns Array of ChapterGroupAssociation results
	 */
	static async associateChaptersWithGroups(
		chapters: ChapterState[],
		seriesId: string,
		csvGroups: Group[],
		apiGroups: ScanGroup[]
	): Promise<ChapterGroupAssociation[]> {
		// Create mapping from CSV groups to API groups
		const csvToApiGroupMap = this.mapCsvGroupsToApiGroups(csvGroups, apiGroups);

		const results: ChapterGroupAssociation[] = [];

		for (const chapter of chapters) {
			// Get chapter info from CSV
			const chapterInfo = await CHAPTER_TITLE_EXPORT_RESOLVER.getChapterInfo(
				seriesId,
				chapter.chapterVolume,
				chapter.chapterNumber
			);

			// Associate chapter with groups
			const matchResult = this.associateChapterWithGroups(
				chapter,
				chapterInfo,
				csvGroups,
				csvToApiGroupMap
			);

			results.push({
				chapter,
				groupIds: matchResult.matchedGroupIds,
				matchedGroups: matchResult.matchedGroupNames,
				unmatchedGroups: matchResult.unmatchedGroups.map((g) => g.primaryName)
			});
		}

		return results;
	}

	/**
	 * Matches groups to chapters by folder path and associates them with WeebDex group IDs.
	 * This is a convenience method that combines matching and association.
	 * @param chapters - Array of chapters to match groups for
	 * @param apiGroups - Groups from WeebDex API
	 * @param csvGroups - Optional: groups from chapter dump. If not provided, will be fetched.
	 * @param seriesId - Optional: series ID. Required if csvGroups is not provided.
	 * @returns Array of ChapterGroupAssociation results
	 */
	static async matchAndAssociateGroupsToChapters(
		chapters: ChapterState[],
		apiGroups: ScanGroup[],
		csvGroups?: Group[],
		seriesId?: string
	): Promise<ChapterGroupAssociation[]> {
		// Get CSV groups if not provided
		let groups = csvGroups;
		if (!groups) {
			if (!seriesId) {
				throw new Error('seriesId is required if csvGroups is not provided');
			}
			groups = await this.getSeriesGroups(seriesId);
		}

		// Match groups to chapters by folder path
		const results: ChapterGroupAssociation[] = [];

		for (const chapter of chapters) {
			const matchingGroups = this.matchGroupsToChapter(chapter, groups);

			// Map matching CSV groups to API group IDs
			const csvToApiGroupMap = this.mapCsvGroupsToApiGroups(matchingGroups, apiGroups);

			const matchedGroupIds: string[] = [];
			const matchedGroupNames: string[] = [];

			for (const group of matchingGroups) {
				const apiGroupId = csvToApiGroupMap.get(group.primaryName);
				if (apiGroupId) {
					matchedGroupIds.push(apiGroupId);
					matchedGroupNames.push(group.primaryName);
				}
			}

			results.push({
				chapter,
				groupIds: matchedGroupIds,
				matchedGroups: matchedGroupNames,
				unmatchedGroups: matchingGroups
					.filter((g) => !csvToApiGroupMap.has(g.primaryName))
					.map((g) => g.primaryName)
			});
		}

		return results;
	}
}

import type { Group } from './ChapterTitleExportResolver.svelte';
import type { ScanGroup } from './UploadingState.svelte';
import { GroupMatcher } from './GroupMatcher.svelte';

export class GroupFormatter {
	/**
	 * Formats a single Group object for display.
	 * Shows primary name with alt names in parentheses if alt names exist.
	 * @param group - The Group object to format
	 * @returns Formatted string like "PrimaryName (alt1, alt2)" or just "PrimaryName"
	 */
	static formatGroup(group: Group): string {
		if (group.altNames.length > 0) {
			return `${group.primaryName} (${group.altNames.join(', ')})`;
		}
		return group.primaryName;
	}

	/**
	 * Formats multiple Group objects for display.
	 * @param groups - Array of Group objects to format
	 * @param separator - Separator between groups (default: ", ")
	 * @returns Formatted string with all groups
	 */
	static formatGroups(groups: Group[], separator: string = ', '): string {
		return groups.map((group) => this.formatGroup(group)).join(separator);
	}

	/**
	 * Formats a ScanGroup for display using its name only.
	 * This is used when we don't have access to CSV Group data with alt names.
	 * @param scanGroup - The ScanGroup object to format
	 * @returns The group name
	 */
	static formatScanGroup(scanGroup: ScanGroup): string {
		return scanGroup.groupName;
	}

	/**
	 * Formats multiple ScanGroups for display.
	 * @param scanGroups - Array of ScanGroup objects to format
	 * @param separator - Separator between groups (default: ", ")
	 * @returns Formatted string with all group names
	 */
	static formatScanGroups(scanGroups: ScanGroup[], separator: string = ', '): string {
		return scanGroups.map((group) => this.formatScanGroup(group)).join(separator);
	}

	/**
	 * Formats ScanGroups with their alt names by looking up CSV groups.
	 * This requires a seriesId to fetch the CSV groups and match them.
	 * @param scanGroups - Array of ScanGroup objects to format
	 * @param seriesId - The series ID to look up CSV groups
	 * @param separator - Separator between groups (default: ", ")
	 * @returns Promise resolving to formatted string with groups and alt names
	 */
	static async formatScanGroupsWithAltNames(
		scanGroups: ScanGroup[],
		seriesId: string,
		separator: string = ', '
	): Promise<string> {
		// Get CSV groups for the series
		const csvGroups = await GroupMatcher.getSeriesGroups(seriesId);

		// Format each ScanGroup, using CSV Group data if available
		const formattedGroups = scanGroups.map((scanGroup) => {
			const csvGroup = GroupMatcher.findMatchingGroup(csvGroups, scanGroup.groupName);
			if (csvGroup) {
				return this.formatGroup(csvGroup);
			}
			// Fall back to just the name if no CSV group found
			return this.formatScanGroup(scanGroup);
		});

		return formattedGroups.join(separator);
	}

	/**
	 * Formats a single ScanGroup with alt names by looking up CSV groups.
	 * @param scanGroup - The ScanGroup object to format
	 * @param seriesId - The series ID to look up CSV groups
	 * @returns Promise resolving to formatted string with group and alt names
	 */
	static async formatScanGroupWithAltNames(
		scanGroup: ScanGroup,
		seriesId: string
	): Promise<string> {
		// Get CSV groups for the series
		const csvGroups = await GroupMatcher.getSeriesGroups(seriesId);

		// Find matching CSV group using GroupMatcher utility
		const csvGroup = GroupMatcher.findMatchingGroup(csvGroups, scanGroup.groupName);
		if (csvGroup) {
			return this.formatGroup(csvGroup);
		}

		// Fall back to just the name if no CSV group found
		return this.formatScanGroup(scanGroup);
	}
}

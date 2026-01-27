import { parse } from 'csv-parse/browser/esm/sync';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { asset } from '$app/paths';

export interface Group {
	primaryName: string;
	altNames: string[]; // EN variants only
}

export interface ChapterInfo {
	volume: string;
	chapter: string;
	title: string;
	groups: Group[];
	language: string;
}

export interface ResolvedChapterInfo {
	groups: Group[]; // Groups for this chapter
	groupTitles: Record<string, string | null>; // Maps group primary names to titles
	ungroupedTitles: Array<string | null>;
}

export class ChapterTitleExportResolver {
	private data = $state<SvelteMap<string, SvelteMap<string, ChapterInfo[]>> | null>(null);
	private isLoading = $state<boolean>(false);
	private loadError = $state<Error | null>(null);
	private loadPromise: Promise<void> | null = null;

	async load(): Promise<void> {
		if (this.data !== null) {
			return;
		}

		if (this.loadPromise) {
			return this.loadPromise;
		}

		this.isLoading = true;
		this.loadError = null;

		let resolvePromise: () => void;
		let rejectPromise: (error: Error) => void;
		this.loadPromise = new Promise<void>((resolve, reject) => {
			resolvePromise = resolve;
			rejectPromise = reject;
		});

		try {
			const url = asset('/chapter_dump.csv');
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
			}

			const csvText = await response.text();
			this.data = this.parseCSV(csvText);
			resolvePromise!();
		} catch (error) {
			this.loadError = error instanceof Error ? error : new Error('Unknown error loading CSV');
			rejectPromise!(this.loadError);
		} finally {
			this.isLoading = false;
		}

		return this.loadPromise;
	}

	private async ensureLoaded(): Promise<void> {
		if (this.data !== null) {
			return;
		}

		if (this.loadPromise) {
			await this.loadPromise;
			return;
		}

		await this.load();
	}

	private parseCSV(csvText: string): SvelteMap<string, SvelteMap<string, ChapterInfo[]>> {
		const records = parse(csvText, {
			columns: true,
			skip_empty_lines: true,
			trim: true
		}) as Array<{
			volume: string;
			chapter: string;
			title: string;
			wd_manga_id: string;
			translated_language: string;
			group_names: string | null;
			group_name_alts: string | null;
		}>;

		const dataMap = new SvelteMap<string, SvelteMap<string, ChapterInfo[]>>();

		for (const record of records) {
			const seriesId = record.wd_manga_id;
			const volume = record.volume || '';
			const chapter = record.chapter || '';
			const language = record.translated_language || 'en';
			const key = `${volume}|${chapter}`;

			// Parse group_names JSON array
			let groupNames: string[] = [];
			if (
				record.group_names != null &&
				record.group_names.trim() !== '' &&
				record.group_names !== '[]'
			) {
				try {
					const parsed = JSON.parse(record.group_names);
					if (Array.isArray(parsed)) {
						groupNames = parsed
							.filter((name): name is string => typeof name === 'string' && name.trim() !== '')
							.map((name) => name.trim());
					}
				} catch (error) {
					console.warn(`Failed to parse group_names for ${seriesId}:`, error);
				}
			}

			// Parse group_name_alts JSON array of arrays
			let groupAltNames: Array<Array<{ [lang: string]: string }>> = [];
			if (
				record.group_name_alts != null &&
				record.group_name_alts.trim() !== '' &&
				record.group_name_alts !== '[]'
			) {
				try {
					const parsed = JSON.parse(record.group_name_alts);
					if (Array.isArray(parsed)) {
						groupAltNames = parsed.map((altNameEntry) => {
							if (Array.isArray(altNameEntry)) {
								return altNameEntry;
							}
							// Handle case where it's a JSON string that needs parsing
							if (typeof altNameEntry === 'string') {
								try {
									const innerParsed = JSON.parse(altNameEntry);
									return Array.isArray(innerParsed) ? innerParsed : [];
								} catch {
									return [];
								}
							}
							return [];
						});
					}
				} catch (error) {
					console.warn(`Failed to parse group_name_alts for ${seriesId}:`, error);
				}
			}

			// Ensure groupAltNames has the same length as groupNames
			while (groupAltNames.length < groupNames.length) {
				groupAltNames.push([]);
			}
			// Trim if longer (shouldn't happen, but be safe)
			if (groupAltNames.length > groupNames.length) {
				groupAltNames = groupAltNames.slice(0, groupNames.length);
			}

			// Build groups array with primary names and EN alt names only
			const groups: Group[] = groupNames.map((primaryName, index) => {
				const altNameEntry = groupAltNames[index] || [];
				// Extract only EN variants from alt names
				const enAltNames: string[] = altNameEntry
					.map((entry) => {
						// Entry is { [lang: string]: string }, check if 'en' key exists
						if (typeof entry === 'object' && entry !== null && 'en' in entry) {
							const enValue = entry['en'];
							return typeof enValue === 'string' ? enValue.trim() : null;
						}
						return null;
					})
					.filter((name): name is string => name !== null && name !== '');

				return {
					primaryName: primaryName.trim(),
					altNames: enAltNames
				};
			});

			const chapterInfo: ChapterInfo = {
				volume,
				chapter,
				title: record.title || '',
				groups,
				language
			};

			if (!dataMap.has(seriesId)) {
				dataMap.set(seriesId, new SvelteMap());
			}

			const seriesMap = dataMap.get(seriesId)!;
			// Append to array to support multiple chapters with same vol/ch but different groups
			if (!seriesMap.has(key)) {
				seriesMap.set(key, []);
			}
			seriesMap.get(key)!.push(chapterInfo);
		}

		return dataMap;
	}

	async getChapterInfo(
		seriesId: string,
		volume: string | null,
		chapter: string | null,
		language: string
	): Promise<ResolvedChapterInfo | null> {
		await this.ensureLoaded();

		if (this.data === null) {
			console.log('[getChapterInfo] Data not loaded');
			return null;
		}

		const seriesMap = this.data.get(seriesId);
		if (!seriesMap) {
			console.log('[getChapterInfo] Series not found:', { seriesId });
			return null;
		}

		const volumeStr = volume || '';
		const chapterStr = chapter || '';
		const key = `${volumeStr}|${chapterStr}`;

		console.log('[getChapterInfo] Looking up:', {
			seriesId,
			volume,
			chapter,
			language,
			volumeStr,
			chapterStr,
			key,
			seriesHasEntries: seriesMap.size > 0,
			availableKeys: Array.from(seriesMap.keys()).slice(0, 10) // Show first 10 keys for debugging
		});

		const chapterInfos = seriesMap.get(key);
		if (!chapterInfos || chapterInfos.length === 0) {
			console.log('[getChapterInfo] No chapter info found for key:', key);
			return null;
		}

		// Filter by language
		const languageFilteredInfos = chapterInfos.filter((ci) => ci.language === language);
		if (languageFilteredInfos.length === 0) {
			console.log('[getChapterInfo] No chapter info found for language:', language);
			return null;
		}

		console.log('[getChapterInfo] Found chapter info:', {
			count: languageFilteredInfos.length,
			language,
			firstChapter: {
				volume: languageFilteredInfos[0].volume,
				chapter: languageFilteredInfos[0].chapter,
				title: languageFilteredInfos[0].title,
				language: languageFilteredInfos[0].language,
				groups: languageFilteredInfos[0].groups.map((g) => ({
					primaryName: g.primaryName,
					altNames: g.altNames
				}))
			}
		});

		// Return the first release (don't merge multiple releases)
		// If you need to match by groups, use getChapterInfoByGroups instead
		const chapterInfo = languageFilteredInfos[0];

		// Build group to title mapping
		// groupTitles maps primary names to titles (not alt names)
		const groupTitles: Record<string, string | null> = {};
		const ungroupedTitles: Array<string | null> = [];

		if (chapterInfo.groups.length > 0) {
			// Chapter has groups - map each group's primary name to the title
			// All groups share the same title for this chapter
			const title = chapterInfo.title && chapterInfo.title.trim() !== '' ? chapterInfo.title : null;
			for (const group of chapterInfo.groups) {
				// Only map primary name to title
				groupTitles[group.primaryName] = title;
			}
		} else {
			// No groups - this is an ungrouped chapter
			if (chapterInfo.title && chapterInfo.title.trim() !== '') {
				ungroupedTitles.push(chapterInfo.title);
			} else {
				// Include null to indicate the chapter exists but has no title
				ungroupedTitles.push(null);
			}
		}

		return {
			groups: [...chapterInfo.groups],
			groupTitles,
			ungroupedTitles
		};
	}

	/**
	 * Finds chapter info by chapter number only (ignoring volume), matching against specific groups.
	 * This is a fallback method when exact volume/chapter match fails.
	 * @param seriesId - The series ID
	 * @param chapter - The chapter number (can be null)
	 * @param groupNames - Array of group names to match against
	 * @param language - The language to match (required)
	 * @returns The matching ResolvedChapterInfo with volume, or null if not found
	 */
	async getChapterInfoByChapterAndGroups(
		seriesId: string,
		chapter: string | null,
		groupNames: string[],
		language: string
	): Promise<{ volume: string; info: ResolvedChapterInfo } | null> {
		await this.ensureLoaded();

		if (this.data === null) {
			console.log('[getChapterInfoByChapterAndGroups] Data not loaded');
			return null;
		}

		const seriesMap = this.data.get(seriesId);
		if (!seriesMap) {
			console.log('[getChapterInfoByChapterAndGroups] Series not found:', { seriesId });
			return null;
		}

		const chapterStr = chapter || '';

		console.log('[getChapterInfoByChapterAndGroups] Searching:', {
			seriesId,
			chapter,
			chapterStr,
			groupNames,
			language,
			totalEntries: seriesMap.size
		});

		// Search through all chapters with matching chapter number
		for (const [key, chapterInfos] of seriesMap.entries()) {
			const [volume, chapterNum] = key.split('|');

			// Check if chapter number matches
			if (chapterNum !== chapterStr) {
				continue;
			}

			// Filter by language first
			const languageFilteredInfos = chapterInfos.filter((ci) => ci.language === language);
			if (languageFilteredInfos.length === 0) {
				continue;
			}

			console.log('[getChapterInfoByChapterAndGroups] Found matching chapter number:', {
				key,
				volume,
				chapterNum,
				language,
				chapterInfosCount: languageFilteredInfos.length
			});

			// Search through all chapters with this vol/ch combination and language
			for (const chapterInfo of languageFilteredInfos) {
				console.log('[getChapterInfoByChapterAndGroups] Checking chapter info:', {
					volume,
					chapter: chapterNum,
					title: chapterInfo.title,
					chapterGroups: chapterInfo.groups.map((g) => ({
						primaryName: g.primaryName,
						altNames: g.altNames
					})),
					providedGroupNames: groupNames
				});

				// If no groups provided, only match ungrouped chapters
				if (groupNames.length === 0) {
					if (chapterInfo.groups.length > 0) {
						console.log(
							'[getChapterInfoByChapterAndGroups] Skipping: has groups but no group names provided'
						);
						continue; // Skip chapters with groups when looking for ungrouped
					}
				} else {
					// Check if any of the provided group names match this chapter's groups
					const hasMatchingGroup = groupNames.some((groupName) => {
						// Check if any group matches (including alt names)
						const matches = chapterInfo.groups.some((g) =>
							ChapterTitleExportResolver.groupMatches(g, groupName)
						);
						console.log('[getChapterInfoByChapterAndGroups] Group match check:', {
							groupName,
							matches
						});
						return matches;
					});

					console.log('[getChapterInfoByChapterAndGroups] Has matching group:', hasMatchingGroup);

					// If no matching group found, skip this chapter
					if (!hasMatchingGroup) {
						console.log('[getChapterInfoByChapterAndGroups] Skipping: no matching group');
						continue;
					}
				}

				// Build group to title mapping
				const groupTitles: Record<string, string | null> = {};
				const ungroupedTitles: Array<string | null> = [];

				if (chapterInfo.groups.length > 0) {
					const title =
						chapterInfo.title && chapterInfo.title.trim() !== '' ? chapterInfo.title : null;
					for (const group of chapterInfo.groups) {
						groupTitles[group.primaryName] = title;
					}
				} else {
					if (chapterInfo.title && chapterInfo.title.trim() !== '') {
						ungroupedTitles.push(chapterInfo.title);
					} else {
						ungroupedTitles.push(null);
					}
				}

				const result = {
					volume,
					info: {
						groups: [...chapterInfo.groups],
						groupTitles,
						ungroupedTitles
					}
				};
				console.log('[getChapterInfoByChapterAndGroups] Returning match:', {
					volume,
					groups: result.info.groups.map((g) => g.primaryName),
					groupTitles: Object.keys(result.info.groupTitles),
					ungroupedTitles: result.info.ungroupedTitles
				});
				return result;
			}
		}

		console.log('[getChapterInfoByChapterAndGroups] No match found, returning null');
		return null;
	}

	async hasSeriesEntries(seriesId: string): Promise<boolean> {
		await this.ensureLoaded();

		if (this.data === null) {
			return false;
		}

		const seriesMap = this.data.get(seriesId);
		if (!seriesMap) {
			return false;
		}

		// Check if there are any entries at all (with or without groups)
		return seriesMap.size > 0;
	}

	/**
	 * Gets chapter info only if there is exactly one unique release for the given volume/chapter combination.
	 * This is used for "fix missing groups" functionality where we want to match without groups but only
	 * when there's a unique match.
	 * @param seriesId - The series ID
	 * @param volume - The volume number (can be null)
	 * @param chapter - The chapter number (can be null)
	 * @param language - The language to match (required)
	 * @returns ResolvedChapterInfo if exactly one release exists, null otherwise
	 */
	async getUniqueChapterInfo(
		seriesId: string,
		volume: string | null,
		chapter: string | null,
		language: string
	): Promise<ResolvedChapterInfo | null> {
		await this.ensureLoaded();

		if (this.data === null) {
			return null;
		}

		const seriesMap = this.data.get(seriesId);
		if (!seriesMap) {
			return null;
		}

		const volumeStr = volume || '';
		const chapterStr = chapter || '';
		const key = `${volumeStr}|${chapterStr}`;

		const chapterInfos = seriesMap.get(key);
		if (!chapterInfos || chapterInfos.length === 0) {
			return null;
		}

		// Filter by language
		const languageFilteredInfos = chapterInfos.filter((ci) => ci.language === language);
		if (languageFilteredInfos.length === 0) {
			return null;
		}

		// Only return if there's exactly one unique release
		if (languageFilteredInfos.length !== 1) {
			return null;
		}

		const chapterInfo = languageFilteredInfos[0];

		// Build group to title mapping
		const groupTitles: Record<string, string | null> = {};
		const ungroupedTitles: Array<string | null> = [];

		if (chapterInfo.groups.length > 0) {
			const title = chapterInfo.title && chapterInfo.title.trim() !== '' ? chapterInfo.title : null;
			for (const group of chapterInfo.groups) {
				groupTitles[group.primaryName] = title;
			}
		} else {
			if (chapterInfo.title && chapterInfo.title.trim() !== '') {
				ungroupedTitles.push(chapterInfo.title);
			} else {
				ungroupedTitles.push(null);
			}
		}

		return {
			groups: [...chapterInfo.groups],
			groupTitles,
			ungroupedTitles
		};
	}

	/**
	 * Gets chapter info by chapter number only (ignoring volume), but only if there is exactly one unique release.
	 * This is used for "fix missing groups" functionality as a fallback when vol/ch match fails.
	 * @param seriesId - The series ID
	 * @param chapter - The chapter number (can be null)
	 * @param language - The language to match (required)
	 * @returns The matching ResolvedChapterInfo with volume, or null if not found or not unique
	 */
	async getUniqueChapterInfoByChapter(
		seriesId: string,
		chapter: string | null,
		language: string
	): Promise<{ volume: string; info: ResolvedChapterInfo } | null> {
		await this.ensureLoaded();

		if (this.data === null) {
			return null;
		}

		const seriesMap = this.data.get(seriesId);
		if (!seriesMap) {
			return null;
		}

		if (!chapter) {
			return null;
		}

		// Find all chapters with this chapter number (ignoring volume) and matching language
		const matchingChapters: Array<{ volume: string; info: ChapterInfo }> = [];

		for (const [key, chapterInfos] of seriesMap.entries()) {
			const [volume, chapterNum] = key.split('|');
			if (chapterNum === chapter) {
				for (const chapterInfo of chapterInfos) {
					// Filter by language
					if (chapterInfo.language === language) {
						matchingChapters.push({ volume, info: chapterInfo });
					}
				}
			}
		}

		// Only return if there's exactly one unique release
		if (matchingChapters.length !== 1) {
			return null;
		}

		const { volume, info: chapterInfo } = matchingChapters[0];

		// Build group to title mapping
		const groupTitles: Record<string, string | null> = {};
		const ungroupedTitles: Array<string | null> = [];

		if (chapterInfo.groups.length > 0) {
			const title = chapterInfo.title && chapterInfo.title.trim() !== '' ? chapterInfo.title : null;
			for (const group of chapterInfo.groups) {
				groupTitles[group.primaryName] = title;
			}
		} else {
			if (chapterInfo.title && chapterInfo.title.trim() !== '') {
				ungroupedTitles.push(chapterInfo.title);
			} else {
				ungroupedTitles.push(null);
			}
		}

		return {
			volume,
			info: {
				groups: [...chapterInfo.groups],
				groupTitles,
				ungroupedTitles
			}
		};
	}

	async getAllGroupNames(seriesId: string): Promise<string[]> {
		await this.ensureLoaded();

		if (this.data === null) {
			return [];
		}

		const seriesMap = this.data.get(seriesId);
		if (!seriesMap) {
			return [];
		}

		const groupNamesSet = new SvelteSet<string>();
		for (const chapterInfos of seriesMap.values()) {
			for (const chapterInfo of chapterInfos) {
				for (const group of chapterInfo.groups) {
					groupNamesSet.add(group.primaryName);
				}
			}
		}

		return Array.from(groupNamesSet);
	}

	/**
	 * Gets all unique Group objects for a series.
	 * Groups are deduplicated by primary name (if multiple chapters have the same group,
	 * only one instance is returned, using the first encountered).
	 * @param seriesId - The series ID
	 * @returns Array of unique Group objects
	 */
	async getAllGroups(seriesId: string): Promise<Group[]> {
		await this.ensureLoaded();

		if (this.data === null) {
			return [];
		}

		const seriesMap = this.data.get(seriesId);
		if (!seriesMap) {
			return [];
		}

		const groupsMap = new SvelteMap<string, Group>();
		for (const chapterInfos of seriesMap.values()) {
			for (const chapterInfo of chapterInfos) {
				for (const group of chapterInfo.groups) {
					// Deduplicate by primary name
					if (!groupsMap.has(group.primaryName)) {
						groupsMap.set(group.primaryName, group);
					}
				}
			}
		}

		return Array.from(groupsMap.values());
	}

	/**
	 * Gets chapter info filtered by matching groups.
	 * This is useful when there are multiple releases of the same chapter by different groups.
	 * Only returns chapter info if at least one of the provided group names matches the chapter's groups.
	 * @param seriesId - The series ID
	 * @param volume - The volume (can be null)
	 * @param chapter - The chapter (can be null)
	 * @param groupNames - Array of group names to match against (can be API group names or CSV group names)
	 * @param language - The language to match (required)
	 * @returns ResolvedChapterInfo if a match is found, null otherwise
	 */
	async getChapterInfoByGroups(
		seriesId: string,
		volume: string | null,
		chapter: string | null,
		groupNames: string[],
		language: string
	): Promise<ResolvedChapterInfo | null> {
		await this.ensureLoaded();

		if (this.data === null) {
			console.log('[getChapterInfoByGroups] Data not loaded');
			return null;
		}

		const seriesMap = this.data.get(seriesId);
		if (!seriesMap) {
			console.log('[getChapterInfoByGroups] Series not found:', { seriesId });
			return null;
		}

		const volumeStr = volume || '';
		const chapterStr = chapter || '';
		const key = `${volumeStr}|${chapterStr}`;

		console.log('[getChapterInfoByGroups] Looking up:', {
			seriesId,
			volume,
			chapter,
			language,
			volumeStr,
			chapterStr,
			key,
			groupNames
		});

		const chapterInfos = seriesMap.get(key);
		if (!chapterInfos || chapterInfos.length === 0) {
			console.log('[getChapterInfoByGroups] No chapter info found for key:', key);
			return null;
		}

		// Filter by language first
		const languageFilteredInfos = chapterInfos.filter((ci) => ci.language === language);
		if (languageFilteredInfos.length === 0) {
			console.log('[getChapterInfoByGroups] No chapter info found for language:', language);
			return null;
		}

		console.log('[getChapterInfoByGroups] Found chapter infos:', {
			count: languageFilteredInfos.length,
			language,
			allChapters: languageFilteredInfos.map((ci) => ({
				volume: ci.volume,
				chapter: ci.chapter,
				title: ci.title,
				language: ci.language,
				groups: ci.groups.map((g) => ({
					primaryName: g.primaryName,
					altNames: g.altNames
				}))
			}))
		});

		// Find the chapter that matches the provided groups
		let matchingChapterInfo: ChapterInfo | null = null;

		for (const chapterInfo of languageFilteredInfos) {
			console.log('[getChapterInfoByGroups] Checking chapter info:', {
				title: chapterInfo.title,
				chapterGroups: chapterInfo.groups.map((g) => ({
					primaryName: g.primaryName,
					altNames: g.altNames
				})),
				providedGroupNames: groupNames
			});

			// If no group names provided, only match ungrouped chapters
			if (groupNames.length === 0) {
				if (chapterInfo.groups.length === 0) {
					// This is an ungrouped chapter, which matches
					console.log('[getChapterInfoByGroups] Matched ungrouped chapter');
					matchingChapterInfo = chapterInfo;
					break;
				}
			} else {
				// Check if any of the provided group names match the chapter's groups
				const hasMatchingGroup = groupNames.some((groupName) => {
					const matches = chapterInfo.groups.some((g) =>
						ChapterTitleExportResolver.groupMatches(g, groupName)
					);
					console.log('[getChapterInfoByGroups] Group match check:', {
						groupName,
						matches,
						chapterGroups: chapterInfo.groups.map((g) => g.primaryName)
					});
					return matches;
				});

				// If matching group found, use this chapter
				if (hasMatchingGroup) {
					console.log('[getChapterInfoByGroups] Found matching chapter with groups');
					matchingChapterInfo = chapterInfo;
					break;
				}
			}
		}

		// If no matching chapter found, return null
		if (!matchingChapterInfo) {
			console.log('[getChapterInfoByGroups] No matching chapter found');
			return null;
		}

		// Build group to title mapping
		const groupTitles: Record<string, string | null> = {};
		const ungroupedTitles: Array<string | null> = [];

		if (matchingChapterInfo.groups.length > 0) {
			const title =
				matchingChapterInfo.title && matchingChapterInfo.title.trim() !== ''
					? matchingChapterInfo.title
					: null;
			for (const group of matchingChapterInfo.groups) {
				groupTitles[group.primaryName] = title;
			}
		} else {
			if (matchingChapterInfo.title && matchingChapterInfo.title.trim() !== '') {
				ungroupedTitles.push(matchingChapterInfo.title);
			} else {
				ungroupedTitles.push(null);
			}
		}

		return {
			groups: [...matchingChapterInfo.groups],
			groupTitles,
			ungroupedTitles
		};
	}

	async getUniqueVolumeChapterCombinations(
		seriesId: string,
		language?: string
	): Promise<
		Array<{ volume: string; chapter: string; language: string; info: ResolvedChapterInfo }>
	> {
		await this.ensureLoaded();

		if (this.data === null) {
			return [];
		}

		const seriesMap = this.data.get(seriesId);
		if (!seriesMap) {
			return [];
		}

		// Convert each chapter to the resolved format
		const combinations: Array<{
			volume: string;
			chapter: string;
			language: string;
			info: ResolvedChapterInfo;
		}> = [];

		for (const [key, chapterInfos] of seriesMap.entries()) {
			const [volume, chapter] = key.split('|');

			// Filter by language if provided
			const filteredInfos = language
				? chapterInfos.filter((ci) => ci.language === language)
				: chapterInfos;

			// Process each chapter with this vol/ch combination separately
			for (const chapterInfo of filteredInfos) {
				// Build group to title mapping
				// groupTitles maps primary names to titles (not alt names)
				const groupTitles: Record<string, string | null> = {};
				const ungroupedTitles: Array<string | null> = [];

				if (chapterInfo.groups.length > 0) {
					// Chapter has groups - map each group's primary name to the title
					// All groups share the same title for this chapter
					const title =
						chapterInfo.title && chapterInfo.title.trim() !== '' ? chapterInfo.title : null;
					for (const group of chapterInfo.groups) {
						// Only map primary name to title
						groupTitles[group.primaryName] = title;
					}
				} else {
					// No groups - this is an ungrouped chapter
					if (chapterInfo.title && chapterInfo.title.trim() !== '') {
						ungroupedTitles.push(chapterInfo.title);
					} else {
						// Include null to indicate the chapter exists but has no title
						ungroupedTitles.push(null);
					}
				}

				const resolvedInfo: ResolvedChapterInfo = {
					groups: [...chapterInfo.groups],
					groupTitles,
					ungroupedTitles
				};

				combinations.push({ volume, chapter, language: chapterInfo.language, info: resolvedInfo });
			}
		}

		// Sort: first by volume (numeric if possible), then by chapter (numeric if possible)
		combinations.sort((a, b) => {
			// Sort by volume first using localeCompare with numeric option
			const volumeCompare = a.volume.localeCompare(b.volume, undefined, {
				numeric: true,
				sensitivity: 'base'
			});

			if (volumeCompare !== 0) {
				return volumeCompare;
			}

			// If volumes are equal, sort by chapter
			return a.chapter.localeCompare(b.chapter, undefined, {
				numeric: true,
				sensitivity: 'base'
			});
		});

		return combinations;
	}

	/**
	 * Checks if a group matches a given string using exact, case-sensitive matching.
	 * Compares against both the primary name and all alt names (EN variants).
	 * @param group - The group to check
	 * @param searchString - The string to match against (exact, case-sensitive)
	 * @returns true if the searchString exactly matches the group's primary name or any alt name
	 */
	static groupMatches(group: Group, searchString: string): boolean {
		// Check primary name
		if (group.primaryName === searchString) {
			return true;
		}

		// Check alt names
		for (const altName of group.altNames) {
			if (altName === searchString) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Finds the primary name of a group that matches the given name (primary or alt name).
	 * @param resolvedInfo - The resolved chapter info containing groups
	 * @param groupName - The group name to search for (can be primary or alt name)
	 * @returns The primary name of the matching group, or null if not found
	 */
	static findGroupPrimaryName(resolvedInfo: ResolvedChapterInfo, groupName: string): string | null {
		for (const group of resolvedInfo.groups) {
			if (ChapterTitleExportResolver.groupMatches(group, groupName)) {
				return group.primaryName;
			}
		}
		return null;
	}

	/**
	 * Finds the best matching combination index based on volume, chapter, and groups.
	 * Prioritizes: exact vol/ch/group match > exact ch/group match > exact ch match > closest ch match
	 * @param combinations - Array of volume/chapter combinations to search
	 * @param volume - Current volume (can be null or empty string)
	 * @param chapter - Current chapter number (can be null or empty string)
	 * @param groupNames - Array of group names to match against
	 * @returns The index of the best matching combination, or null if no combinations provided
	 */
	static findBestMatchingCombinationIndex(
		combinations: Array<{ volume: string; chapter: string; info: ResolvedChapterInfo }>,
		volume: string | null,
		chapter: string | null,
		groupNames: string[]
	): number | null {
		if (combinations.length === 0) {
			return null;
		}

		const currentVolume = volume || '';
		const currentChapter = chapter || '';

		// Helper to check if groups match
		const groupsMatch = (combinationGroups: Group[], targetGroupNames: string[]): boolean => {
			if (targetGroupNames.length === 0) {
				// If no target groups, match ungrouped chapters
				return combinationGroups.length === 0;
			}

			// Check if any target group name matches any combination group
			return targetGroupNames.some((targetName) =>
				combinationGroups.some((g) => ChapterTitleExportResolver.groupMatches(g, targetName))
			);
		};

		// Helper to calculate chapter distance (for numeric comparison)
		const chapterDistance = (ch1: string, ch2: string): number => {
			const num1 = parseFloat(ch1);
			const num2 = parseFloat(ch2);
			if (!isNaN(num1) && !isNaN(num2)) {
				return Math.abs(num1 - num2);
			}
			// Fallback to string comparison
			return Math.abs(ch1.localeCompare(ch2, undefined, { numeric: true }));
		};

		let bestIndex: number | null = null;
		let bestScore = -1; // Higher is better

		for (let i = 0; i < combinations.length; i++) {
			const combination = combinations[i];
			const vol = combination.volume || '';
			const ch = combination.chapter || '';

			let score = 0;

			// Check volume match
			const volumeMatch = vol === currentVolume;
			if (volumeMatch) {
				score += 1000; // High priority for volume match
			}

			// Check chapter match
			const chapterMatch = ch === currentChapter;
			if (chapterMatch) {
				score += 100; // High priority for chapter match
			} else if (currentChapter) {
				// If chapter doesn't match, calculate distance (closer is better)
				const distance = chapterDistance(ch, currentChapter);
				score += Math.max(0, 50 - distance); // Closer chapters get higher score
			}

			// Check group match
			const groupMatch = groupsMatch(combination.info.groups, groupNames);
			if (groupMatch) {
				score += 10; // Bonus for group match
			}

			// Prefer exact matches
			if (volumeMatch && chapterMatch && groupMatch) {
				// Perfect match - return immediately
				return i;
			}

			if (score > bestScore) {
				bestScore = score;
				bestIndex = i;
			}
		}

		return bestIndex;
	}
}

export interface GroupLookupResult {
	successful: Array<{ id: string; name: string }>;
	failed: string[];
}

/**
 * Looks up groups from the API by their names.
 * This is a utility function that can be used by components that need to resolve
 * CSV group names to API group IDs.
 * @param groupNames - Array of group names to look up
 * @param searchGroupsFn - Function to search for groups via API (from TargetingState)
 * @param existingGroups - Optional array of existing groups to skip lookup for
 * @returns Object containing successful lookups and failed group names
 */
export async function lookupGroupsFromAPI(
	groupNames: string[],
	searchGroupsFn: (name: string) => Promise<{ data?: Array<{ id: string; name: string }> }>,
	existingGroups?: Array<{ groupName: string }>
): Promise<GroupLookupResult> {
	const successful: Array<{ id: string; name: string }> = [];
	const failed: string[] = [];

	for (const groupName of groupNames) {
		// Check if group already exists
		if (existingGroups?.some((g) => g.groupName === groupName)) {
			// We don't add it to successful here since we don't have the ID,
			// but we also don't need to look it up
			continue;
		}

		try {
			const response = await searchGroupsFn(groupName);

			if (!response.data) {
				failed.push(groupName);
				console.warn(`No data found for group "${groupName}"`);
				continue;
			}

			// Find exact match
			const exactMatch = response.data.find((g) => g.name === groupName);

			if (exactMatch) {
				successful.push({ id: exactMatch.id, name: exactMatch.name });
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

	return { successful, failed };
}

export const CHAPTER_TITLE_EXPORT_RESOLVER = new ChapterTitleExportResolver();

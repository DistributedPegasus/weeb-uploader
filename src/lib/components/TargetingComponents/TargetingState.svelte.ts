import {
	RATE_LIMITER_GLOBAL,
	RATE_LIMITER_CHAPTER_UPDATE,
	RATE_LIMITER_CHAPTER_DELETE
} from '$lib/core/ApiWithRateLimit.svelte';
import type { ChapterState, ScanGroup } from '$lib/core/UploadingState.svelte';
import type { ApiChapter, ChapterUpdateData } from '$lib/core/ChapterEditorState.svelte';
import axios from 'axios';
import { createContext } from 'svelte';

export class TargetingState {
	public seriesId = $state<string | null>(null);
	public chapterStates = $state<ChapterState[]>([]);
	public availableScanGroups = $state<ScanGroup[]>([]);

	public reset() {
		this.seriesId = null;
		this.chapterStates = [];
		this.availableScanGroups = [];
	}
}

export const targetingStateContext = createContext<TargetingState>();

export interface ComicInfoExtra {
	OriginalSeries?: string;
	Tags?: {
		Tag?: string | string[];
	};
	Groups?: {
		Group?: string | string[];
	};
	Timestamp?: string | number;
}

export interface ChapterComicInfoDefinitionFile {
	ComicInfo: {
		Series?: string;
		Title?: string;
		Number?: string | number;
		Volume?: string | number;
		ScanInformation?: string;
		Year?: string | number;
		Month?: string | number;
		Day?: string | number;
		Extra?: ComicInfoExtra;
	};
}

export interface MangaData {
	id: string;
	title: string;
	description: string;
	relationships: {
		cover?: {
			id: string;
			ext: string;
			dimensions: number[];
		};
		links?: {
			al?: string;
			ap?: string;
			kt?: string;
			mal?: string;
			md?: string;
			mu?: string;
		};
	};
}

export interface GroupData {
	id: string;
	name: string;
	description?: string;
	contact_email?: string;
	discord?: string;
	twitter?: string;
	website?: string;
	mangadex?: string;
	mangaupdates?: string;
	inactive?: boolean;
	locked?: boolean;
	created_at?: string;
	updated_at?: string;
	version?: number;
	relationships?: {
		members?: Array<{
			id: string;
			name: string;
			avatar_url?: string;
			description?: string;
			discord?: string;
			twitter?: string;
			website?: string;
			is_leader?: boolean;
			is_officer?: boolean;
			roles?: string[];
			version?: number;
		}>;
	};
}

export interface GroupsResponse {
	data?: GroupData[];
	limit: number;
	page: number;
	total: number;
}

export interface MangaResponse {
	data: MangaData[];
	limit: number;
	page: number;
	total: number;
}

export async function searchGroups(query: string) {
	return await RATE_LIMITER_GLOBAL.execute(async () => {
		const response = await axios.get(`https://api.weebdex.org/group`, {
			params: {
				name: query
			}
		});

		if (response.status !== 200) {
			throw new Error(`Failed to search groups: ${response.status} ${response.statusText}`);
		}

		return response.data as GroupsResponse;
	});
}

export async function searchManga(query: string) {
	return await RATE_LIMITER_GLOBAL.execute(async () => {
		const response = await axios.get(`https://api.weebdex.org/manga`, {
			params: {
				title: query,
				limit: 20,
				sort: 'relevance',
				page: 1
			}
		});

		if (response.status !== 200) {
			throw new Error(`Failed to search manga: ${response.status} ${response.statusText}`);
		}

		return response.data as MangaResponse;
	});
}

export interface AggregateChapterEntry {
	published_at: string;
	language: number;
	groups: number[]; // These are indices into the groups array
}

export interface AggregateGroup {
	id: string;
	name: string;
}

export interface AggregateChapter {
	volume: string | null;
	chapter: string;
	entries: Record<string, AggregateChapterEntry>;
}

export interface MangaAggregateResponse {
	chapters: AggregateChapter[];
	groups: AggregateGroup[];
	languages: string[];
}

export async function getMangaAggregate(mangaId: string): Promise<MangaAggregateResponse> {
	return await RATE_LIMITER_GLOBAL.execute(async () => {
		const response = await axios.get(`https://api.weebdex.org/manga/${mangaId}/aggregate`);

		if (response.status !== 200) {
			throw new Error(`Failed to get manga aggregate: ${response.status} ${response.statusText}`);
		}

		const responseRaw = response.data;

		const responseWrapped: MangaAggregateResponse = {
			chapters: responseRaw.chapters ?? [],
			groups: responseRaw.groups ?? [],
			languages: responseRaw.languages ?? []
		};

		return responseWrapped;
	});
}

export async function getGroupById(groupId: string): Promise<GroupData | null> {
	return await RATE_LIMITER_GLOBAL.execute(async () => {
		try {
			const response = await axios.get(`https://api.weebdex.org/group/${groupId}`);

			if (response.status !== 200) {
				return null;
			}

			return response.data as GroupData;
		} catch {
			return null;
		}
	});
}

export interface ChaptersResponse {
	data: ApiChapter[];
	limit: number;
	page: number;
	total: number;
}

/**
 * Fetches all chapters for a manga by paginating through all pages.
 * @param mangaId - The manga ID
 * @returns Array of all chapters
 */
export async function getMangaChapters(mangaId: string): Promise<ApiChapter[]> {
	const allChapters: ApiChapter[] = [];
	let page = 1;
	let hasMore = true;
	const limit = 100; // API default limit

	while (hasMore) {
		console.log(`Fetching chapters page ${page}`);
		const response = await RATE_LIMITER_GLOBAL.execute(async () => {
			const result = await axios.get(`https://api.weebdex.org/manga/${mangaId}/chapters`, {
				params: {
					page,
					limit
				},
				timeout: 10000 // 10 second timeout
			});

			if (result.status !== 200) {
				throw new Error(`Failed to fetch chapters: ${result.status} ${result.statusText}`);
			}

			return result.data as ChaptersResponse;
		});

		if (response.data && response.data.length > 0) {
			allChapters.push(...response.data);
		}

		// Check if there are more pages
		const totalPages = Math.ceil(response.total / response.limit);
		hasMore = page < totalPages;
		page++;
	}

	// Normalize chapters: convert empty string titles and volumes to null
	return allChapters.map((chapter) => ({
		...chapter,
		title: chapter.title === '' ? null : chapter.title,
		volume: chapter.volume === '' ? null : chapter.volume
	}));
}

/**
 * Updates a chapter via the API.
 * @param chapterId - The chapter ID
 * @param data - The chapter update data
 * @param token - The API authentication token
 * @returns The updated chapter data
 */
export async function updateChapter(
	chapterId: string,
	data: ChapterUpdateData,
	token: string
): Promise<ApiChapter> {
	return await RATE_LIMITER_CHAPTER_UPDATE.execute(async () => {
		const response = await axios.put(`https://api.weebdex.org/chapter/${chapterId}`, data, {
			headers: {
				Authorization: `Bearer ${token}`
			}
		});

		if (response.status !== 200) {
			throw new Error(`Failed to update chapter: ${response.status} ${response.statusText}`);
		}

		return response.data as ApiChapter;
	});
}

/**
 * Deletes a chapter via the API.
 * @param chapterId - The chapter ID
 * @param token - The API authentication token
 */
export async function deleteChapter(chapterId: string, token: string): Promise<void> {
	return await RATE_LIMITER_CHAPTER_DELETE.execute(async () => {
		const response = await axios.delete(`https://api.weebdex.org/chapter/${chapterId}`, {
			headers: {
				Authorization: `Bearer ${token}`
			}
		});

		if (response.status !== 200 && response.status !== 204) {
			throw new Error(`Failed to delete chapter: ${response.status} ${response.statusText}`);
		}
	});
}

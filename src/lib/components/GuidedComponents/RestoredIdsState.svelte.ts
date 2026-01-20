import { parse } from 'csv-parse/browser/esm/sync';
import { SvelteMap } from 'svelte/reactivity';

const SHEET_URL_STORAGE_KEY = 'restored-ids-sheet-url';

export interface RestoredIdEntry {
	mangadexId: string;
	weebdexId: string;
	legacyMangadexId: string;
	restored: boolean;
}

export class RestoredIdsState {
	private _data = $state<SvelteMap<string, RestoredIdEntry> | null>(null); // Map by weebdex_id
	private _legacyIdMap = $state<SvelteMap<string, RestoredIdEntry> | null>(null); // Map by legacy_mangadex_id
	private _allRestoredWeebdexIds = $state<string[]>([]);
	private _allRestoredLegacyIds = $state<string[]>([]);
	public isLoading = $state<boolean>(false);
	public loadError = $state<Error | null>(null);
	private loadPromise: Promise<void> | null = null;
	private _sheetUrl = $state<string>('');

	constructor() {
		// Load sheet URL from localStorage
		this._sheetUrl = this.getSheetUrlFromStorage();
		// Auto-load on construction
		this.load();
	}

	/**
	 * Get the current sheet URL
	 */
	get sheetUrl(): string {
		return this._sheetUrl;
	}

	/**
	 * Set the sheet URL and save to localStorage
	 */
	setSheetUrl(url: string): void {
		this._sheetUrl = url.trim();
		this.saveSheetUrlToStorage(this._sheetUrl);
	}

	/**
	 * Normalize a Google Sheets URL to CSV export format
	 * Converts: https://docs.google.com/spreadsheets/d/SHEET_ID/edit#gid=123
	 * To: https://docs.google.com/spreadsheets/d/SHEET_ID/export?format=csv&gid=123
	 */
	private normalizeSheetUrl(url: string): string {
		if (!url) {
			return url;
		}

		// Check if it's a Google Sheets URL
		const sheetsRegex = /https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
		const match = url.match(sheetsRegex);

		if (!match) {
			// Not a Google Sheets URL, return as-is
			return url;
		}

		const sheetId = match[1];

		// Extract gid if present (specific sheet within the spreadsheet)
		const gidMatch = url.match(/[#&]gid=(\d+)/);
		const gid = gidMatch ? gidMatch[1] : '0';

		// Construct the CSV export URL
		return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
	}

	/**
	 * Load sheet URL from localStorage
	 */
	private getSheetUrlFromStorage(): string {
		if (typeof localStorage === 'undefined') {
			return '';
		}
		try {
			return localStorage.getItem(SHEET_URL_STORAGE_KEY) || '';
		} catch (error) {
			console.error('Failed to load sheet URL from localStorage:', error);
			return '';
		}
	}

	/**
	 * Save sheet URL to localStorage
	 */
	private saveSheetUrlToStorage(url: string): void {
		if (typeof localStorage === 'undefined') {
			return;
		}
		try {
			if (url) {
				localStorage.setItem(SHEET_URL_STORAGE_KEY, url);
			} else {
				localStorage.removeItem(SHEET_URL_STORAGE_KEY);
			}
		} catch (error) {
			console.error('Failed to save sheet URL to localStorage:', error);
		}
	}

	/**
	 * Reload data from the sheet URL (forces a fresh load)
	 */
	async reload(): Promise<void> {
		this._data = null;
		this._legacyIdMap = null;
		this._allRestoredWeebdexIds = [];
		this._allRestoredLegacyIds = [];
		this.loadPromise = null;
		await this.load();
	}

	public get allRestoredWeebdexIds(): string[] {
		return this._allRestoredWeebdexIds;
	}

	public get allRestoredLegacyIds(): string[] {
		return this._allRestoredLegacyIds;
	}

	async load(): Promise<void> {
		if (this._data !== null && this._legacyIdMap !== null) {
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
			// If no sheet URL is configured, initialize with empty data
			if (!this._sheetUrl) {
				this._data = new SvelteMap<string, RestoredIdEntry>();
				this._legacyIdMap = new SvelteMap<string, RestoredIdEntry>();
				this._allRestoredWeebdexIds = [];
				this._allRestoredLegacyIds = [];
				resolvePromise!();
				return;
			}

			// Normalize the URL to CSV export format
			const csvUrl = this.normalizeSheetUrl(this._sheetUrl);

			const response = await fetch(csvUrl);
			if (!response.ok) {
				throw new Error(`Failed to fetch sheet: ${response.status} ${response.statusText}`);
			}

			const csvText = await response.text();
			const { data, legacyIdMap, restoredWeebdexIds, restoredLegacyIds } = this.parseCSV(csvText);
			this._data = data;
			this._legacyIdMap = legacyIdMap;
			this._allRestoredWeebdexIds = restoredWeebdexIds;
			this._allRestoredLegacyIds = restoredLegacyIds;
			resolvePromise!();
		} catch (error) {
			this.loadError =
				error instanceof Error ? error : new Error('Unknown error loading restored IDs CSV');
			this._data = new SvelteMap<string, RestoredIdEntry>();
			this._legacyIdMap = new SvelteMap<string, RestoredIdEntry>();
			this._allRestoredWeebdexIds = [];
			this._allRestoredLegacyIds = [];
			rejectPromise!(this.loadError);
		} finally {
			this.isLoading = false;
		}

		return this.loadPromise;
	}

	private async ensureLoaded(): Promise<void> {
		if (this._data !== null && this._legacyIdMap !== null) {
			return;
		}

		if (this.loadPromise) {
			await this.loadPromise;
			return;
		}

		await this.load();
	}

	private parseCSV(csvText: string): {
		data: SvelteMap<string, RestoredIdEntry>;
		legacyIdMap: SvelteMap<string, RestoredIdEntry>;
		restoredWeebdexIds: string[];
		restoredLegacyIds: string[];
	} {
		const records = parse(csvText, {
			columns: true,
			skip_empty_lines: true,
			trim: true
		}) as Array<{
			mangadex_id: string;
			weebdex_id: string;
			legacy_mangadex_id: string;
			dma_2020_chapter_count: string;
			'State of MD Unavailable': string;
			restored: string;
			'Has MD Unavailable': string;
		}>;

		const data = new SvelteMap<string, RestoredIdEntry>();
		const legacyIdMap = new SvelteMap<string, RestoredIdEntry>();
		const restoredWeebdexIds: string[] = [];
		const restoredLegacyIds: string[] = [];

		for (const record of records) {
			const weebdexId = record.weebdex_id?.trim() || '';
			const legacyMangadexId = record.legacy_mangadex_id?.trim() || '';
			const mangadexId = record.mangadex_id?.trim() || '';
			const restored = record.restored?.trim().toUpperCase() === 'TRUE';

			if (weebdexId) {
				const entry: RestoredIdEntry = {
					mangadexId,
					weebdexId,
					legacyMangadexId,
					restored
				};

				data.set(weebdexId, entry);

				if (legacyMangadexId) {
					legacyIdMap.set(legacyMangadexId, entry);
				}

				if (restored) {
					restoredWeebdexIds.push(weebdexId);
					if (legacyMangadexId) {
						restoredLegacyIds.push(legacyMangadexId);
					}
				}
			}
		}

		return {
			data,
			legacyIdMap,
			restoredWeebdexIds: restoredWeebdexIds.sort(),
			restoredLegacyIds: restoredLegacyIds.sort()
		};
	}

	/**
	 * Checks if a weebdex ID is restored (restored === "TRUE" in the spreadsheet)
	 */
	async isRestoredByWeebdexId(weebdexId: string): Promise<boolean> {
		await this.ensureLoaded();

		if (this._data === null) {
			return false;
		}

		const entry = this._data.get(weebdexId);
		return entry?.restored ?? false;
	}

	/**
	 * Checks if a legacy ID is restored (restored === "TRUE" in the spreadsheet)
	 */
	async isRestoredByLegacyId(legacyId: string): Promise<boolean> {
		await this.ensureLoaded();

		if (this._legacyIdMap === null) {
			return false;
		}

		const entry = this._legacyIdMap.get(legacyId);
		return entry?.restored ?? false;
	}

	/**
	 * Gets the restored entry for a weebdex ID, if it exists
	 */
	async getEntryByWeebdexId(weebdexId: string): Promise<RestoredIdEntry | null> {
		await this.ensureLoaded();

		if (this._data === null) {
			return null;
		}

		return this._data.get(weebdexId) || null;
	}

	/**
	 * Gets the restored entry for a legacy ID, if it exists
	 */
	async getEntryByLegacyId(legacyId: string): Promise<RestoredIdEntry | null> {
		await this.ensureLoaded();

		if (this._legacyIdMap === null) {
			return null;
		}

		return this._legacyIdMap.get(legacyId) || null;
	}

	/**
	 * Checks if a weebdex ID exists in the spreadsheet (regardless of restored status)
	 */
	async existsInSpreadsheet(weebdexId: string): Promise<boolean> {
		await this.ensureLoaded();

		if (this._data === null) {
			return false;
		}

		return this._data.has(weebdexId);
	}

	/**
	 * Checks if a legacy ID exists in the spreadsheet (regardless of restored status)
	 */
	async existsInSpreadsheetByLegacyId(legacyId: string): Promise<boolean> {
		await this.ensureLoaded();

		if (this._legacyIdMap === null) {
			return false;
		}

		return this._legacyIdMap.has(legacyId);
	}
}

export const RESTORED_IDS_STATE = new RestoredIdsState();

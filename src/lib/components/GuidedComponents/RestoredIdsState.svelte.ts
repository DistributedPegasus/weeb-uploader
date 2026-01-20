import { parse } from 'csv-parse/browser/esm/sync';
import { SvelteMap } from 'svelte/reactivity';

const RESTORED_CSV_URL = '';

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

	constructor() {
		// Auto-load on construction
		this.load();
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
			//const response = await fetch(RESTORED_CSV_URL);
			//if (!response.ok) {
				this._data = new SvelteMap<string, RestoredIdEntry>();
				this._legacyIdMap = new SvelteMap<string, RestoredIdEntry>();
				this._allRestoredWeebdexIds = [];
				this._allRestoredLegacyIds = [];
				resolvePromise!();
				return;
			//}

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

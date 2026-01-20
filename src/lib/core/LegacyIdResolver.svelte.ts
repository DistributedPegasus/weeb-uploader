import { parse } from 'csv-parse/browser/esm/sync';
import { SvelteMap } from 'svelte/reactivity';
import { asset } from '$app/paths';

export class LegacyIdResolver {
	private legacyToWeebdexMap = $state<SvelteMap<string, string> | null>(null);
	private weebdexToLegacyMap = $state<SvelteMap<string, string> | null>(null);
	private isLoading = $state<boolean>(false);
	private loadError = $state<Error | null>(null);
	private loadPromise: Promise<void> | null = null;

	async load(): Promise<void> {
		if (this.legacyToWeebdexMap !== null && this.weebdexToLegacyMap !== null) {
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
			const url = asset('/weebdex_lookup.csv');
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
			}

			const csvText = await response.text();
			const { legacyToWeebdex, weebdexToLegacy } = this.parseCSV(csvText);
			this.legacyToWeebdexMap = legacyToWeebdex;
			this.weebdexToLegacyMap = weebdexToLegacy;
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
		if (this.legacyToWeebdexMap !== null && this.weebdexToLegacyMap !== null) {
			return;
		}

		if (this.loadPromise) {
			await this.loadPromise;
			return;
		}

		await this.load();
	}

	private parseCSV(csvText: string): {
		legacyToWeebdex: SvelteMap<string, string>;
		weebdexToLegacy: SvelteMap<string, string>;
	} {
		const records = parse(csvText, {
			columns: true,
			skip_empty_lines: true,
			trim: true
		}) as Array<{
			weebdex_id: string;
			legacy_id: string;
		}>;

		const legacyToWeebdex = new SvelteMap<string, string>();
		const weebdexToLegacy = new SvelteMap<string, string>();

		for (const record of records) {
			const weebdexId = record.weebdex_id?.trim() || '';
			const legacyId = record.legacy_id?.trim() || '';

			if (weebdexId && legacyId) {
				legacyToWeebdex.set(legacyId, weebdexId);
				weebdexToLegacy.set(weebdexId, legacyId);
			}
		}

		return { legacyToWeebdex, weebdexToLegacy };
	}

	/**
	 * Converts a legacy ID to a WeebDex ID.
	 * @param legacyId - The legacy ID to convert
	 * @returns The corresponding WeebDex ID, or null if not found
	 */
	async getWeebdexIdFromLegacyId(legacyId: string): Promise<string | null> {
		await this.ensureLoaded();

		if (this.legacyToWeebdexMap === null) {
			return null;
		}

		return this.legacyToWeebdexMap.get(legacyId) || null;
	}

	/**
	 * Converts a WeebDex ID to a legacy ID (MangaDex ID).
	 * @param weebdexId - The WeebDex ID to convert
	 * @returns The corresponding legacy ID, or null if not found
	 */
	async getLegacyIdFromWeebdexId(weebdexId: string): Promise<string | null> {
		await this.ensureLoaded();

		if (this.weebdexToLegacyMap === null) {
			return null;
		}

		return this.weebdexToLegacyMap.get(weebdexId) || null;
	}
}

export const LEGACY_ID_RESOLVER = new LegacyIdResolver();

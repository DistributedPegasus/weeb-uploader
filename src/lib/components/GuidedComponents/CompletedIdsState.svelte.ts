import { createContext } from 'svelte';
import { LEGACY_ID_RESOLVER } from '$lib/core/LegacyIdResolver.svelte';

const COMPLETED_IDS_KEY = 'completedWeebdexIds';
const COMPLETED_IDS_V2_KEY = 'completedWeebdexIdsV2';

export interface CompletedIdEntry {
	weebdexId: string;
	legacyId: string | null; // null if legacy ID not found
}

export interface SessionData {
	timestamp: string;
	ids: CompletedIdEntry[];
}

export class CompletedIdsState {
	private _sessions = $state<SessionData[]>([]);
	private _allCombinedIds = $state<string[]>([]);
	private _allLegacyIds = $state<string[]>([]);

	constructor() {
		// Start migration in background, then load data
		this.migrateIfNeeded().then(() => {
			this.loadData();
		});
		// Also try loading immediately in case migration already completed or isn't needed
		this.loadData();
	}

	public get sessions(): SessionData[] {
		return this._sessions;
	}

	public get allCombinedIds(): string[] {
		return this._allCombinedIds;
	}

	public get allLegacyIds(): string[] {
		return this._allLegacyIds;
	}

	/**
	 * Migrate old format (string[]) to new format (CompletedIdEntry[])
	 */
	private async migrateIfNeeded(): Promise<void> {
		if (typeof window === 'undefined') return;

		// Check if new format already exists
		if (localStorage.getItem(COMPLETED_IDS_V2_KEY)) {
			return; // Already migrated
		}

		// Check if old format exists
		const oldData = localStorage.getItem(COMPLETED_IDS_KEY);
		if (!oldData) {
			return; // No data to migrate
		}

		try {
			const oldSessions = JSON.parse(oldData) as Record<string, string[]>;
			const newSessions: Record<string, CompletedIdEntry[]> = {};

			// Load legacy ID resolver
			await LEGACY_ID_RESOLVER.load();

			// Convert each session
			for (const [timestamp, weebdexIds] of Object.entries(oldSessions)) {
				const entries: CompletedIdEntry[] = [];

				for (const weebdexId of weebdexIds) {
					const legacyId = await LEGACY_ID_RESOLVER.getLegacyIdFromWeebdexId(weebdexId);
					entries.push({
						weebdexId,
						legacyId
					});
				}

				newSessions[timestamp] = entries;
			}

			// Save new format
			localStorage.setItem(COMPLETED_IDS_V2_KEY, JSON.stringify(newSessions));

			// Optionally remove old format (keeping it for safety, but could remove)
			localStorage.removeItem(COMPLETED_IDS_KEY);
		} catch (error) {
			console.error('Failed to migrate completed IDs:', error);
		}
	}

	/**
	 * Add a completed weebdex ID to the specified session timestamp
	 * Also looks up and stores the corresponding legacy ID
	 */
	public async addCompletedId(sessionTimestamp: string, weebdexId: string): Promise<void> {
		if (typeof window === 'undefined') return;

		try {
			await LEGACY_ID_RESOLVER.load();
			const legacyId = await LEGACY_ID_RESOLVER.getLegacyIdFromWeebdexId(weebdexId);

			const allSessions = JSON.parse(localStorage.getItem(COMPLETED_IDS_V2_KEY) || '{}') as Record<
				string,
				CompletedIdEntry[]
			>;

			// Initialize array for this timestamp if it doesn't exist
			if (!allSessions[sessionTimestamp]) {
				allSessions[sessionTimestamp] = [];
			}

			// Check if ID already exists
			const exists = allSessions[sessionTimestamp].some((entry) => entry.weebdexId === weebdexId);

			if (!exists) {
				allSessions[sessionTimestamp].push({
					weebdexId,
					legacyId
				});
				localStorage.setItem(COMPLETED_IDS_V2_KEY, JSON.stringify(allSessions));
				// Reload data to update reactive state
				this.loadData();
			}
		} catch (error) {
			console.error('Failed to save weebdex ID to localStorage:', error);
		}
	}

	/**
	 * Load all completed IDs from localStorage and update reactive state
	 */
	public loadData(): void {
		if (typeof window === 'undefined') return;

		try {
			const allSessions = JSON.parse(localStorage.getItem(COMPLETED_IDS_V2_KEY) || '{}') as Record<
				string,
				CompletedIdEntry[]
			>;

			// Convert to array and sort by timestamp (newest first)
			this._sessions = Object.entries(allSessions)
				.map(([timestamp, entries]) => ({
					timestamp,
					ids: [...entries] // Create a copy
				}))
				.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

			// Get all unique weebdex IDs across all sessions
			const allWeebdexIds: string[] = [];
			const allLegacyIds: string[] = [];
			for (const session of this._sessions) {
				for (const entry of session.ids) {
					if (!allWeebdexIds.includes(entry.weebdexId)) {
						allWeebdexIds.push(entry.weebdexId);
					}
					if (entry.legacyId && !allLegacyIds.includes(entry.legacyId)) {
						allLegacyIds.push(entry.legacyId);
					}
				}
			}
			this._allCombinedIds = allWeebdexIds.sort();
			this._allLegacyIds = allLegacyIds.sort();
		} catch (error) {
			console.error('Failed to load completed IDs from localStorage:', error);
			this._sessions = [];
			this._allCombinedIds = [];
			this._allLegacyIds = [];
		}
	}

	/**
	 * Delete a specific session by timestamp
	 */
	public deleteSession(timestamp: string): void {
		if (typeof window === 'undefined') return;

		try {
			const allSessions = JSON.parse(localStorage.getItem(COMPLETED_IDS_V2_KEY) || '{}') as Record<
				string,
				CompletedIdEntry[]
			>;

			if (allSessions[timestamp]) {
				delete allSessions[timestamp];
				localStorage.setItem(COMPLETED_IDS_V2_KEY, JSON.stringify(allSessions));
				this.loadData();
			}
		} catch (error) {
			console.error('Failed to delete session:', error);
		}
	}

	/**
	 * Clear all completed IDs from localStorage
	 */
	public clearAll(): void {
		if (typeof window === 'undefined') return;
		localStorage.removeItem(COMPLETED_IDS_V2_KEY);
		// Also clear old format if it exists
		localStorage.removeItem(COMPLETED_IDS_KEY);
		this.loadData();
	}

	/**
	 * Get IDs for a specific session timestamp (returns weebdex IDs for backward compatibility)
	 */
	public getSessionIds(timestamp: string): string[] {
		const session = this._sessions.find((s) => s.timestamp === timestamp);
		return session?.ids.map((entry) => entry.weebdexId) || [];
	}

	/**
	 * Import legacy IDs by looking up their corresponding weebdex IDs
	 * Creates a new session with "imported-" prefix + timestamp
	 */
	public async importLegacyIds(legacyIds: string[]): Promise<{ imported: number; failed: number }> {
		if (typeof window === 'undefined') return { imported: 0, failed: 0 };

		try {
			await LEGACY_ID_RESOLVER.load();

			// Create session timestamp with "imported-" prefix
			// Format as ISO-like string manually to avoid SvelteDate requirement
			const timestamp = Date.now();
			// Format: imported-YYYY-MM-DDTHH:mm:ss.sssZ (using timestamp)
			const sessionTimestamp = `imported-${timestamp}`;

			const allSessions = JSON.parse(localStorage.getItem(COMPLETED_IDS_V2_KEY) || '{}') as Record<
				string,
				CompletedIdEntry[]
			>;

			// Initialize array for this timestamp
			if (!allSessions[sessionTimestamp]) {
				allSessions[sessionTimestamp] = [];
			}

			let imported = 0;
			let failed = 0;

			// Process each legacy ID
			for (const legacyId of legacyIds) {
				const trimmedLegacyId = legacyId.trim();
				if (!trimmedLegacyId) continue;

				try {
					// Look up weebdex ID from legacy ID
					const weebdexId = await LEGACY_ID_RESOLVER.getWeebdexIdFromLegacyId(trimmedLegacyId);

					if (weebdexId) {
						// Check if this weebdex ID already exists in this session
						const exists = allSessions[sessionTimestamp].some(
							(entry) => entry.weebdexId === weebdexId
						);

						if (!exists) {
							allSessions[sessionTimestamp].push({
								weebdexId,
								legacyId: trimmedLegacyId
							});
							imported++;
						}
					} else {
						failed++;
					}
				} catch (error) {
					console.error(`Failed to lookup weebdex ID for legacy ID ${trimmedLegacyId}:`, error);
					failed++;
				}
			}

			// Save if we imported anything
			if (imported > 0) {
				localStorage.setItem(COMPLETED_IDS_V2_KEY, JSON.stringify(allSessions));
				// Reload data to update reactive state
				this.loadData();
			}

			return { imported, failed };
		} catch (error) {
			console.error('Failed to import legacy IDs:', error);
			return { imported: 0, failed: legacyIds.length };
		}
	}
}

export const completedIdsStateContext = createContext<CompletedIdsState>();

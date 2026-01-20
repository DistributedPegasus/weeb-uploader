<script lang="ts">
	import { getContext } from 'svelte';
	import {
		completedIdsStateContext,
		type CompletedIdsState,
		type CompletedIdEntry
	} from './CompletedIdsState.svelte';
	import { RESTORED_IDS_STATE } from './RestoredIdsState.svelte';

	type ViewMode = 'per-session' | 'all-combined';

	let viewMode = $state<ViewMode>('per-session');
	let selectedTimestamp = $state<string | null>(null);
	let isExpanded = $state(false);
	let showCSV = $state(false);
	let showImport = $state(false);
	let importText = $state('');
	let isImporting = $state(false);
	let importResult = $state<{ imported: number; failed: number } | null>(null);
	let entriesWithRestoredStatus = $state<
		Array<{ entry: CompletedIdEntry; isRestored: boolean; inSpreadsheet: boolean }>
	>([]);
	let isLoadingRestoredStatus = $state(false);

	const completedIdsState = getContext<CompletedIdsState>(completedIdsStateContext);

	const sessions = $derived(completedIdsState.sessions);
	const allCombinedIds = $derived(completedIdsState.allCombinedIds);
	const restoredIdsState = RESTORED_IDS_STATE;

	// Update restored status when entries change
	$effect(() => {
		const entries = getEntriesToDisplay();
		if (entries.length === 0) {
			entriesWithRestoredStatus = [];
			return;
		}

		isLoadingRestoredStatus = true;
		Promise.all(
			entries.map(async (entry) => {
				const isRestored = entry.weebdexId
					? await restoredIdsState.isRestoredByWeebdexId(entry.weebdexId)
					: entry.legacyId
						? await restoredIdsState.isRestoredByLegacyId(entry.legacyId)
						: false;
				const inSpreadsheet = entry.weebdexId
					? await restoredIdsState.existsInSpreadsheet(entry.weebdexId)
					: entry.legacyId
						? await restoredIdsState.existsInSpreadsheetByLegacyId(entry.legacyId)
						: false;
				return { entry, isRestored, inSpreadsheet };
			})
		).then((results) => {
			entriesWithRestoredStatus = results;
			isLoadingRestoredStatus = false;
		});
	});

	function formatTimestamp(timestamp: string): string {
		// Handle imported sessions (format: imported-<number>)
		if (timestamp.startsWith('imported-')) {
			const numPart = timestamp.replace('imported-', '');
			const num = Number.parseInt(numPart, 10);
			if (!Number.isNaN(num)) {
				try {
					const date = new Date(num);
					return `Imported: ${date.toLocaleString()}`;
				} catch {
					return timestamp;
				}
			}
			return timestamp;
		}

		// Handle regular ISO timestamp strings
		try {
			const date = new Date(timestamp);
			return date.toLocaleString();
		} catch {
			return timestamp;
		}
	}

	function copyToClipboard(text: string) {
		if (typeof navigator === 'undefined' || !navigator.clipboard) return;
		navigator.clipboard.writeText(text).catch((err) => {
			console.error('Failed to copy to clipboard:', err);
		});
	}

	function getIdsToDisplay(): string[] {
		if (viewMode === 'all-combined') {
			return allCombinedIds;
		} else if (selectedTimestamp) {
			return completedIdsState.getSessionIds(selectedTimestamp);
		}
		return [];
	}

	function getEntriesToDisplay(): CompletedIdEntry[] {
		if (viewMode === 'all-combined') {
			// Get all unique entries across all sessions
			const entriesMap = new Map<string, CompletedIdEntry>();
			for (const session of sessions) {
				for (const entry of session.ids) {
					if (!entriesMap.has(entry.weebdexId)) {
						entriesMap.set(entry.weebdexId, entry);
					}
				}
			}
			return Array.from(entriesMap.values()).sort((a, b) => a.weebdexId.localeCompare(b.weebdexId));
		} else if (selectedTimestamp) {
			const session = sessions.find((s) => s.timestamp === selectedTimestamp);
			return session ? [...session.ids] : [];
		}
		return [];
	}

	function exportToCSV(): string {
		const entries = getEntriesToDisplay();
		const headers = ['weebdex_id', 'legacy_id'];
		const rows = entries.map((entry) => [
			entry.weebdexId,
			entry.legacyId || '' // Empty string if legacy ID is null
		]);

		// Escape CSV values (handle commas, quotes, newlines)
		function escapeCSV(value: string): string {
			if (value.includes(',') || value.includes('"') || value.includes('\n')) {
				return `"${value.replace(/"/g, '""')}"`;
			}
			return value;
		}

		const csvRows = [
			headers.map(escapeCSV).join(','),
			...rows.map((row) => row.map(escapeCSV).join(','))
		];

		return csvRows.join('\n');
	}

	function toggleCSV() {
		showCSV = !showCSV;
	}

	function copyCSVToClipboard() {
		const csv = exportToCSV();
		copyToClipboard(csv);
	}

	function parseLegacyIds(input: string): string[] {
		// Handle multiple formats: CSV, newline-separated, comma-separated
		const lines = input.split('\n');
		const ids: string[] = [];

		for (const line of lines) {
			// If line looks like CSV (has comma), try to parse it
			if (line.includes(',')) {
				const parts = line.split(',');
				for (const part of parts) {
					const trimmed = part.trim();
					// Skip CSV headers
					if (
						trimmed &&
						trimmed.toLowerCase() !== 'legacy_id' &&
						trimmed.toLowerCase() !== 'weebdex_id'
					) {
						ids.push(trimmed);
					}
				}
			} else {
				// Single value per line
				const trimmed = line.trim();
				if (trimmed) {
					ids.push(trimmed);
				}
			}
		}

		return ids.filter((id) => id.length > 0);
	}

	async function handleImport() {
		if (!importText.trim()) return;

		isImporting = true;
		importResult = null;

		try {
			const legacyIds = parseLegacyIds(importText);
			if (legacyIds.length === 0) {
				importResult = { imported: 0, failed: 0 };
				isImporting = false;
				return;
			}

			const result = await completedIdsState.importLegacyIds(legacyIds);
			importResult = result;

			// Clear input on success
			if (result.imported > 0) {
				importText = '';
				// Switch to per-session view and select the imported session
				viewMode = 'per-session';
				// The imported session will be the newest one
				const importedSession = completedIdsState.sessions.find((s) =>
					s.timestamp.startsWith('imported-')
				);
				if (importedSession) {
					selectedTimestamp = importedSession.timestamp;
				}
			}
		} catch (error) {
			console.error('Import failed:', error);
			importResult = { imported: 0, failed: parseLegacyIds(importText).length };
		} finally {
			isImporting = false;
		}
	}

	function getDisplayTitle(): string {
		if (viewMode === 'all-combined') {
			return `All Combined IDs (${allCombinedIds.length} unique)`;
		} else if (selectedTimestamp) {
			const session = sessions.find((s) => s.timestamp === selectedTimestamp);
			return session
				? `${formatTimestamp(selectedTimestamp)} (${session.ids.length} IDs)`
				: 'No session selected';
		}
		return 'Select a session';
	}
</script>

<div class="flex flex-col gap-4 bg-surface rounded-md p-4">
	<button
		type="button"
		class="flex flex-row items-center gap-2 w-full text-left cursor-pointer hover:bg-surface-hover rounded-md p-2 -m-2 transition-colors"
		onclick={() => {
			isExpanded = !isExpanded;
		}}
	>
		<span class="w-4 h-4 flex items-center justify-center">
			{#if isExpanded}
				<span class="i-mdi-chevron-down text-muted"></span>
			{:else}
				<span class="i-mdi-chevron-right text-muted"></span>
			{/if}
		</span>
		<h3 class="text-lg font-semibold text-app">Completed WeebDex IDs</h3>
	</button>

	{#if isExpanded}
		<div class="flex flex-row gap-2 items-center">
			<label for="view-mode" class="text-sm text-muted">View Mode:</label>
			<button
				type="button"
				class="btn-base px-3 py-1 text-sm {viewMode === 'per-session'
					? 'btn-primary'
					: 'btn-neutral'}"
				onclick={() => {
					viewMode = 'per-session';
					selectedTimestamp = null;
				}}
			>
				Per Session
			</button>
			<button
				type="button"
				class="btn-base px-3 py-1 text-sm {viewMode === 'all-combined'
					? 'btn-primary'
					: 'btn-neutral'}"
				onclick={() => {
					viewMode = 'all-combined';
					selectedTimestamp = null;
				}}
			>
				All Combined
			</button>
		</div>

		{#if viewMode === 'per-session'}
			<div class="flex flex-col gap-2">
				<div class="flex flex-row gap-2 items-end">
					<div class="flex flex-col gap-2 flex-1">
						<label for="session-selector" class="text-sm font-medium text-app"
							>Select Session:</label
						>
						<select
							id="session-selector"
							class="bg-surface border border-surface rounded-md px-3 py-2 text-app"
							onchange={(e) => {
								selectedTimestamp = (e.target as HTMLSelectElement).value || null;
							}}
						>
							<option value="">-- Select a session --</option>
							{#each sessions as session}
								<option value={session.timestamp}>
									{formatTimestamp(session.timestamp)} ({session.ids.length} IDs)
								</option>
							{/each}
						</select>
					</div>
					{#if selectedTimestamp}
						<button
							type="button"
							class="btn-base btn-danger px-3 py-1 text-sm whitespace-nowrap"
							onclick={() => {
								if (!selectedTimestamp) return;
								const session = sessions.find((s) => s.timestamp === selectedTimestamp);
								const sessionLabel = session ? formatTimestamp(selectedTimestamp) : 'this session';
								if (
									confirm(
										`Are you sure you want to delete ${sessionLabel}? This will remove ${session?.ids.length || 0} ID(s). This cannot be undone.`
									)
								) {
									completedIdsState.deleteSession(selectedTimestamp);
									selectedTimestamp = null;
								}
							}}
							title="Delete selected session"
						>
							Delete Session
						</button>
					{/if}
				</div>
			</div>
		{/if}

		{#if (viewMode === 'all-combined' || selectedTimestamp) && getIdsToDisplay().length > 0}
			<div class="flex flex-col gap-2">
				<div class="flex flex-row justify-between items-center">
					<p class="text-sm font-medium text-app">{getDisplayTitle()}</p>
					<div class="flex flex-row gap-2">
						<button
							type="button"
							class="btn-base btn-neutral px-3 py-1 text-sm"
							onclick={() => copyToClipboard(getIdsToDisplay().join('\n'))}
							title="Copy all IDs to clipboard"
						>
							Copy IDs
						</button>
						<button
							type="button"
							class="btn-base btn-neutral px-3 py-1 text-sm"
							onclick={toggleCSV}
							title="Show CSV format (includes weebdex ID and legacy ID)"
						>
							{showCSV ? 'Hide CSV' : 'Show CSV'}
						</button>
					</div>
				</div>
				{#if showCSV}
					<div class="flex flex-col gap-2">
						<div class="flex flex-row justify-end">
							<button
								type="button"
								class="btn-base btn-neutral px-3 py-1 text-sm"
								onclick={copyCSVToClipboard}
								title="Copy CSV to clipboard"
							>
								Copy CSV
							</button>
						</div>
						<textarea
							readonly
							value={exportToCSV()}
							class="bg-surface border border-surface rounded-md p-3 text-sm font-mono text-app resize-none"
							rows={Math.min(exportToCSV().split('\n').length + 2, 20)}
							onclick={(e) => (e.target as HTMLTextAreaElement).select()}
						></textarea>
					</div>
				{:else}
					<div class="bg-surface border border-surface rounded-md p-3 max-h-96 overflow-y-auto">
						<div class="flex flex-col gap-1">
							{#if isLoadingRestoredStatus}
								<div class="text-sm text-muted">Loading restored status...</div>
							{:else if entriesWithRestoredStatus.length > 0}
								{#each entriesWithRestoredStatus as { entry, isRestored, inSpreadsheet }}
									<div class="flex flex-row gap-2 items-center text-sm">
										<div class="flex-1 font-mono text-app">{entry.weebdexId}</div>
										{#if entry.legacyId}
											<div class="text-xs text-muted font-mono">({entry.legacyId})</div>
										{/if}
										{#if isRestored}
											<span
												class="px-2 py-1 text-xs rounded bg-green-500/20 text-green-400"
												title="Marked as restored in spreadsheet"
											>
												Restored
											</span>
										{:else if inSpreadsheet}
											<span
												class="px-2 py-1 text-xs rounded bg-yellow-500/20 text-yellow-400"
												title="In spreadsheet but not marked as restored"
											>
												In Sheet
											</span>
										{:else}
											<span
												class="px-2 py-1 text-xs rounded bg-gray-500/20 text-gray-400"
												title="Not yet in spreadsheet"
											>
												Local Only
											</span>
										{/if}
									</div>
								{/each}
							{:else}
								{#each getIdsToDisplay() as id}
									<div class="text-sm text-app font-mono">{id}</div>
								{/each}
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{:else if viewMode === 'per-session' && !selectedTimestamp}
			<p class="text-sm text-muted">Please select a session to view IDs</p>
		{:else}
			<p class="text-sm text-muted">No completed IDs found</p>
		{/if}

		<div class="flex flex-col gap-2">
			<button
				type="button"
				class="btn-base btn-neutral px-3 py-1 text-sm w-full"
				onclick={() => {
					showImport = !showImport;
					if (showImport) {
						importResult = null;
					}
				}}
			>
				{showImport ? 'Hide Import' : 'Import Legacy IDs'}
			</button>

			{#if showImport}
				<div class="flex flex-col gap-2 bg-surface border border-surface rounded-md p-3">
					<label for="import-text" class="text-sm font-medium text-app">
						Paste legacy IDs (one per line, or CSV format):
					</label>
					<textarea
						id="import-text"
						bind:value={importText}
						placeholder="12345&#10;67890&#10;or CSV: legacy_id&#10;12345,67890"
						class="bg-surface border border-surface rounded-md p-3 text-sm font-mono text-app resize-none"
						rows={6}
						disabled={isImporting}
					></textarea>
					<div class="flex flex-row gap-2 items-center">
						<button
							type="button"
							class="btn-base btn-primary px-3 py-1 text-sm"
							onclick={handleImport}
							disabled={isImporting || !importText.trim()}
						>
							{isImporting ? 'Importing...' : 'Import'}
						</button>
						{#if importResult}
							<span class="text-sm text-muted">
								Imported: {importResult.imported}, Failed: {importResult.failed}
							</span>
						{/if}
					</div>
				</div>
			{/if}
		</div>

		<div class="flex flex-row gap-2">
			<button
				type="button"
				class="btn-base btn-neutral px-3 py-1 text-sm"
				onclick={() => completedIdsState.loadData()}
			>
				Refresh
			</button>
			<button
				type="button"
				class="btn-base btn-danger px-3 py-1 text-sm"
				onclick={() => {
					if (
						confirm(
							'Are you sure you want to clear all completed IDs from localStorage? This cannot be undone.'
						)
					) {
						completedIdsState.clearAll();
					}
				}}
			>
				Clear All
			</button>
		</div>
	{/if}
</div>

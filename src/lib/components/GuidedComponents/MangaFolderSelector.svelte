<script lang="ts">
	import type { GuidedState, ZipFileInfo } from './GuidedState.svelte';
	import { getContext } from 'svelte';
	import { completedIdsStateContext, type CompletedIdsState } from './CompletedIdsState.svelte';
	import { RESTORED_IDS_STATE } from './RestoredIdsState.svelte';
	import { extractMangaDexIdFromZipName } from './guidedUtils';

	interface Props {
		guidedState: GuidedState;
		class?: string;
		onDone: () => void;
	}

	let { guidedState, class: className = '', onDone }: Props = $props();

	const completedIdsState = getContext<CompletedIdsState>(completedIdsStateContext);
	const restoredIdsState = RESTORED_IDS_STATE;

	// Toggle for filtering out completed zip files (from local storage)
	let filterCompletedEnabled = $state(true);
	// Toggle for filtering out restored IDs (from spreadsheet)
	let filterRestoredEnabled = $state(true);

	// Batch selector via legacy IDs
	let legacyIdInput = $state('');
	let showLegacyIdBatchSelector = $state(false);

	function toggleZipSelection(zipFile: File) {
		const index = guidedState.selectedZipFiles.indexOf(zipFile);
		if (index >= 0) {
			guidedState.selectedZipFiles = guidedState.selectedZipFiles.filter((f) => f !== zipFile);
		} else {
			guidedState.selectedZipFiles = [...guidedState.selectedZipFiles, zipFile];
		}
	}

	function toggleMangaFolder(mangaFolderName: string) {
		const zipsInFolder = Array.from(guidedState.zipFilesByMangaFolder.get(mangaFolderName) ?? []);
		const allSelected = zipsInFolder.every((zipInfo) =>
			guidedState.selectedZipFiles.includes(zipInfo.file)
		);

		if (allSelected) {
			// Deselect all zips in this folder
			guidedState.selectedZipFiles = guidedState.selectedZipFiles.filter(
				(file) => !zipsInFolder.some((zipInfo) => zipInfo.file === file)
			);
		} else {
			// Select all zips in this folder
			const newSelections = zipsInFolder
				.map((zipInfo) => zipInfo.file)
				.filter((file) => !guidedState.selectedZipFiles.includes(file));
			guidedState.selectedZipFiles = [...guidedState.selectedZipFiles, ...newSelections];
		}
	}

	// Get all visible (non-filtered) zip files
	const visibleZipFiles = $derived.by(() => {
		const visible: File[] = [];
		for (const zipInfos of zipFilesByFolder.values()) {
			for (const zipInfo of zipInfos) {
				visible.push(zipInfo.file);
			}
		}
		return visible;
	});

	// Calculate how many zip files were filtered out
	const filteredOutCount = $derived.by(() => {
		return guidedState.zipFiles.length - visibleZipFiles.length;
	});

	function toggleAll() {
		const visible = visibleZipFiles;
		const allVisibleSelected = visible.every((file) => guidedState.selectedZipFiles.includes(file));

		if (allVisibleSelected) {
			// Deselect all visible
			guidedState.selectedZipFiles = guidedState.selectedZipFiles.filter(
				(file) => !visible.includes(file)
			);
		} else {
			// Select all visible
			const newSelections = visible.filter((file) => !guidedState.selectedZipFiles.includes(file));
			guidedState.selectedZipFiles = [...guidedState.selectedZipFiles, ...newSelections];
		}
	}

	const allSelected = $derived.by(() => {
		const visible = visibleZipFiles;
		return (
			visible.length > 0 && visible.every((file) => guidedState.selectedZipFiles.includes(file))
		);
	});

	// Get completed MangaDex IDs (MD-####) that should be filtered out
	// Use the legacy IDs directly from CompletedIdsState
	// Use $derived.by to ensure reactivity
	const completedMangaDexIds = $derived.by(() => completedIdsState.allLegacyIds);

	// State to track filtered zip files (async filtering)
	let zipFilesByFolder = $state<Map<string, ZipFileInfo[]>>(new Map());
	let isFiltering = $state(false);
	let filterTaskId = 0;
	// Counts for filtered files
	let filteredCompletedCount = $state(0);
	let filteredRestoredCount = $state(0);
	let filteredBothCount = $state(0);

	// Update filtered zip files when filters or data change
	$effect(() => {
		// Explicitly track filter toggles to ensure reactivity
		const filterCompleted = filterCompletedEnabled;
		const filterRestored = filterRestoredEnabled;

		const allFolders = guidedState.zipFilesByMangaFolder;
		const currentFilterTaskId = ++filterTaskId;
		isFiltering = true;

		// Ensure restored IDs are loaded
		restoredIdsState.load().then(() => {
			// Check if this is still the current filter task
			if (currentFilterTaskId !== filterTaskId) {
				return; // A newer filter task has started, ignore this one
			}

			(async () => {
				const filtered = new Map<string, ZipFileInfo[]>();
				let completedCount = 0;
				let restoredCount = 0;
				let bothCount = 0;

				for (const [mangaFolderName, zipInfos] of allFolders.entries()) {
					if (filterCompleted || filterRestored) {
						// Filter individual zip files, not entire folders
						const filteredZips: ZipFileInfo[] = [];
						for (const zipInfo of zipInfos) {
							const mangaDexId = extractMangaDexIdFromZipName(zipInfo.file.name);
							if (!mangaDexId) {
								// No ID found, always show
								filteredZips.push(zipInfo);
								continue;
							}

							let isCompleted = false;
							let isRestored = false;

							// Check if it should be filtered by restored status (from spreadsheet)
							if (filterRestored) {
								isRestored = await restoredIdsState.isRestoredByLegacyId(mangaDexId);
							}

							// Check if it should be filtered by completed status (from local storage)
							if (filterCompleted) {
								isCompleted = completedMangaDexIds && completedMangaDexIds.includes(mangaDexId);
							}

							// Only filter if at least one enabled filter matches
							if (isCompleted && isRestored) {
								bothCount++;
							} else if (isRestored) {
								restoredCount++;
							} else if (isCompleted) {
								completedCount++;
							} else {
								// Not filtered by any enabled filter, show it
								filteredZips.push(zipInfo);
							}
						}

						// Only include the folder if it has at least one non-filtered zip file
						if (filteredZips.length > 0) {
							filtered.set(mangaFolderName, filteredZips);
						}
					} else {
						// Filtering disabled - show all zip files
						filtered.set(mangaFolderName, Array.from(zipInfos));
					}
				}

				// Only update if this is still the current filter task
				if (currentFilterTaskId === filterTaskId) {
					zipFilesByFolder = filtered;
					filteredCompletedCount = completedCount;
					filteredRestoredCount = restoredCount;
					filteredBothCount = bothCount;
					isFiltering = false;
				}
			})();
		});
	});

	/**
	 * Parses legacy ID input and extracts MD-#### IDs.
	 * Handles both "MD-12345" and "12345" formats.
	 * Returns a Set of numeric IDs (without "MD-" prefix).
	 */
	function parseLegacyIds(input: string): Set<string> {
		const ids = new Set<string>();
		const lines = input
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);

		for (const line of lines) {
			// Try to match "MD-####" format
			const mdPattern = /MD-(\d+)/i;
			const mdMatch = line.match(mdPattern);
			if (mdMatch) {
				ids.add(mdMatch[1]);
				continue;
			}

			// Try to match just digits (assuming it's a legacy ID)
			const digitsPattern = /^(\d+)$/;
			const digitsMatch = line.match(digitsPattern);
			if (digitsMatch) {
				ids.add(digitsMatch[1]);
			}
		}

		return ids;
	}

	/**
	 * Batch selects zip files matching the provided legacy IDs.
	 */
	function batchSelectByLegacyIds() {
		const legacyIds = parseLegacyIds(legacyIdInput);
		if (legacyIds.size === 0) {
			return;
		}

		const matchingZipFiles: File[] = [];

		// Search through all zip files (not just visible ones)
		for (const zipInfo of guidedState.zipFiles) {
			const zipMangaDexId = extractMangaDexIdFromZipName(zipInfo.file.name);
			if (zipMangaDexId && legacyIds.has(zipMangaDexId)) {
				matchingZipFiles.push(zipInfo.file);
			}
		}

		// Add matching files to selection (avoid duplicates)
		const newSelections = matchingZipFiles.filter(
			(file) => !guidedState.selectedZipFiles.includes(file)
		);
		guidedState.selectedZipFiles = [...guidedState.selectedZipFiles, ...newSelections];

		// Clear input after batch selection
		legacyIdInput = '';
		showLegacyIdBatchSelector = false;
	}
</script>

<div class="flex flex-col gap-4 {className}">
	<div class="flex flex-row justify-between items-center">
		<h2 class="text-xl font-bold text-app">Select Zip Files to Process</h2>
		<div class="flex flex-row gap-2 items-center">
			<div class="flex flex-row gap-2 items-center">
				<label class="flex flex-row items-center gap-2 cursor-pointer">
					<input
						type="checkbox"
						checked={filterCompletedEnabled}
						onchange={(e) => {
							filterCompletedEnabled = (e.target as HTMLInputElement).checked;
						}}
						class="w-4 h-4 text-green-600 dark:text-green-400 rounded focus:ring-green-500"
					/>
					<span class="text-sm text-muted">Hide completed (local)</span>
				</label>
				<label class="flex flex-row items-center gap-2 cursor-pointer">
					<input
						type="checkbox"
						checked={filterRestoredEnabled}
						onchange={(e) => {
							filterRestoredEnabled = (e.target as HTMLInputElement).checked;
						}}
						class="w-4 h-4 text-green-600 dark:text-green-400 rounded focus:ring-green-500"
					/>
					<span class="text-sm text-muted">Hide restored (sheet)</span>
				</label>
			</div>
			<button type="button" class="btn-base btn-neutral px-4 py-2" onclick={toggleAll}>
				{allSelected ? 'Deselect All' : 'Select All'}
			</button>
		</div>
	</div>

	<!-- Batch Selector via Legacy IDs -->
	<div class="flex flex-col gap-2">
		<button
			type="button"
			class="btn-base btn-neutral px-4 py-2 text-sm self-start"
			onclick={() => {
				showLegacyIdBatchSelector = !showLegacyIdBatchSelector;
			}}
		>
			{showLegacyIdBatchSelector ? 'Hide' : 'Show'} Batch Select by Legacy IDs
		</button>

		{#if showLegacyIdBatchSelector}
			<div class="flex flex-col gap-2 p-4 border border-surface rounded-lg bg-surface">
				<label for="legacy-id-input" class="text-sm font-semibold text-app">
					Batch Select by Legacy IDs (MD-#### format, one per line)
				</label>
				<textarea
					id="legacy-id-input"
					bind:value={legacyIdInput}
					placeholder="MD-12345&#10;MD-67890&#10;12345&#10;67890"
					class="w-full min-h-32 p-3 border border-surface rounded-md bg-background text-app font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary"
				></textarea>
				<div class="flex flex-row gap-2">
					<button
						type="button"
						class="btn-primary px-4 py-2 text-sm"
						onclick={batchSelectByLegacyIds}
						disabled={!legacyIdInput.trim()}
					>
						Select Matching Files
					</button>
					<button
						type="button"
						class="btn-base btn-neutral px-4 py-2 text-sm"
						onclick={() => {
							legacyIdInput = '';
						}}
					>
						Clear
					</button>
				</div>
				<p class="text-xs text-muted">
					Enter legacy IDs in MD-#### format (e.g., "MD-12345") or just the numeric part (e.g.,
					"12345"). One ID per line. Matching zip files will be selected.
				</p>
			</div>
		{/if}
	</div>

	<div class="flex flex-col gap-1">
		<p class="text-sm text-muted">
			{guidedState.selectedZipFiles.length} of {visibleZipFiles.length} visible zip file{visibleZipFiles.length ===
			1
				? ''
				: 's'} selected
		</p>
		{#if isFiltering}
			<p class="text-xs text-muted italic">Filtering zip files...</p>
		{:else if filterCompletedEnabled || filterRestoredEnabled}
			{@const totalFiltered = filteredCompletedCount + filteredRestoredCount + filteredBothCount}
			{#if totalFiltered > 0}
				<div class="flex flex-col gap-1">
					<p class="text-xs text-muted italic">
						Total hidden: {totalFiltered} zip file{totalFiltered === 1 ? '' : 's'}
					</p>
					<div class="flex flex-row gap-3 text-xs text-muted italic ml-2">
						{#if filterCompletedEnabled && filteredCompletedCount > 0}
							<span>Completed: {filteredCompletedCount}</span>
						{/if}
						{#if filterRestoredEnabled && filteredRestoredCount > 0}
							<span>Restored: {filteredRestoredCount}</span>
						{/if}
						{#if filteredBothCount > 0}
							<span>Both: {filteredBothCount}</span>
						{/if}
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<div class="flex flex-col gap-4 max-h-150 overflow-y-auto">
		{#each Array.from(zipFilesByFolder.entries()) as [mangaFolderName, zipInfos]}
			<div class="flex flex-col gap-2">
				<div class="flex flex-row justify-between items-center">
					<h3 class="text-lg font-semibold text-app">{mangaFolderName}</h3>
					<button
						type="button"
						class="btn-base btn-neutral px-3 py-1 text-sm"
						onclick={() => toggleMangaFolder(mangaFolderName)}
					>
						{zipInfos.every((zipInfo) => guidedState.selectedZipFiles.includes(zipInfo.file))
							? 'Deselect All'
							: 'Select All'} ({zipInfos.length})
					</button>
				</div>
				<div class="flex flex-col gap-2 ml-4">
					{#each zipInfos as zipInfo}
						{@const isSelected = guidedState.selectedZipFiles.includes(zipInfo.file)}
						<button
							type="button"
							class="flex flex-row gap-2 justify-between items-center b-1 border-surface cursor-pointer hover:bg-surface-hover rounded-md p-3 {isSelected
								? 'bg-surface-hover'
								: ''}"
							onclick={() => toggleZipSelection(zipInfo.file)}
						>
							<div class="flex flex-col gap-1 flex-1 text-left">
								<p class="text-sm font-bold text-app">{zipInfo.file.name}</p>
								<p class="text-xs text-muted">
									Size: {(zipInfo.file.size / (1024 * 1024)).toFixed(2)} MB
								</p>
							</div>
							<input
								type="checkbox"
								checked={isSelected}
								class="w-5 h-5 text-green-600 dark:text-green-400 rounded focus:ring-green-500 pointer-events-none"
							/>
						</button>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	<button
		type="button"
		class="btn-primary w-full px-6 py-3 font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
		disabled={guidedState.selectedZipFiles.length === 0}
		onclick={onDone}
	>
		Continue to Processing ({guidedState.selectedZipFiles.length} selected)
	</button>
</div>

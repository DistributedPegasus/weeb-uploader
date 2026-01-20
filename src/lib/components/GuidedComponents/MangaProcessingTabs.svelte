<script lang="ts">
	import { getContext } from 'svelte';
	import type { GuidedState } from './GuidedState.svelte';
	import {
		MangaProcessingStatus,
		AutomationState,
		automationStateContext
	} from './GuidedState.svelte';
	import DropdownSingleSelector from '../Common/DropdownSingleSelector.svelte';
	import type MangaProcessor from './MangaProcessor.svelte';

	interface Props {
		guidedState: GuidedState;
		class?: string;
		onZipSelected: (zipFile: File) => void;
		onAutomationRequestUpload?: () => void;
		mangaProcessorRef?: MangaProcessor | null;
	}

	let {
		guidedState,
		class: className = '',
		onZipSelected,
		onAutomationRequestUpload,
		mangaProcessorRef
	}: Props = $props();

	// Get automation state from context
	const automationState = getContext<AutomationState>(automationStateContext);
	if (!automationState) {
		throw new Error(
			'MangaProcessingTabs must be used within a component that provides AutomationState context'
		);
	}

	function handleNextZip() {
		if (guidedState.moveToNextZip()) {
			const current = guidedState.currentZip;
			if (current) {
				onZipSelected(current.file);
			}
		}
	}

	function handleZipSelect(zipFileName: string) {
		const zipInfo = guidedState.zipFiles.find((z) => z.file.name === zipFileName);
		if (zipInfo) {
			const index = guidedState.zipFiles.findIndex((z) => z.file === zipInfo.file);
			if (index >= 0) {
				guidedState.currentZipIndex = index;
				onZipSelected(zipInfo.file);
			}
		}
	}

	function toggleAutomation() {
		if (automationState.enabled) {
			automationState.disable();
		} else {
			automationState.enable();
		}
	}

	const currentZipName = $derived(guidedState.currentZip?.file.name ?? null);
	const pendingZipNames = $derived(guidedState.pendingZips.map((z) => z.file.name));
	const warningZipNames = $derived(guidedState.warningZips.map((z) => z.file.name));
	const errorZipNames = $derived(guidedState.errorZips.map((z) => z.file.name));
	const completedZipNames = $derived(guidedState.completedZips.map((z) => z.file.name));
	const processingZipNames = $derived(guidedState.processingZips.map((z) => z.file.name));
	const unprocessedZipNames = $derived(guidedState.unprocessedZips.map((z) => z.file.name));
	const nextZipName = $derived(guidedState.nextZip?.file.name ?? null);

	// Check if automation should stop (only warnings/errors remain)
	const shouldStopAutomation = $derived(
		guidedState.pendingZips.length === 0 &&
			(guidedState.warningZips.length > 0 || guidedState.errorZips.length > 0)
	);

	// Watch for automation stop condition
	$effect(() => {
		if (shouldStopAutomation && automationState.isActive) {
			automationState.disable();
		}
	});

	let selectedZipName = $state<string | null>(null);

	$effect(() => {
		selectedZipName = guidedState.currentZip?.file.name ?? null;
	});

	$effect(() => {
		const selected = selectedZipName;
		if (selected) {
			const current = guidedState.currentZip?.file.name ?? null;
			if (selected !== current) {
				handleZipSelect(selected);
			}
		}
	});

	// Automation logic is now handled in MangaProcessor
	// This component just displays the state and provides controls

	const statusCounts = $derived({
		pending: guidedState.pendingZips.length,
		warning: guidedState.warningZips.length,
		error: guidedState.errorZips.length,
		completed: guidedState.completedZips.length,
		processing: guidedState.processingZips.length
	});
</script>

<div class="flex flex-col gap-4 bg-surface rounded-md p-4 {className}">
	<!-- Automation Mode Toggle -->
	<div class="flex flex-row justify-between items-center border-b border-surface-hover pb-2">
		<h2 class="text-xl font-bold text-app">Zip Processing</h2>
		<div class="flex flex-row gap-2 items-center">
			<span class="text-sm text-muted">
				Automation (experimental): <span
					class="font-semibold {automationState.enabled ? 'text-green-500' : 'text-gray-500'}"
					>{automationState.enabled ? 'ON' : 'OFF'}</span
				>
			</span>
			<button
				type="button"
				class="px-4 py-2 rounded-md font-medium transition-colors {automationState.enabled
					? 'bg-green-500 hover:bg-green-600 text-white'
					: 'bg-gray-500 hover:bg-gray-600 text-white'}"
				onclick={toggleAutomation}
			>
				{automationState.enabled ? '🔄 Turn OFF' : '▶️ Turn ON'}
			</button>
		</div>
	</div>

	<!-- Status Summary -->
	<div class="flex flex-row gap-4 flex-wrap text-sm">
		<div class="flex flex-row gap-2 items-center">
			<span class="w-3 h-3 rounded-full bg-gray-500"></span>
			<span class="text-muted">Pending: {statusCounts.pending}</span>
		</div>
		<div class="flex flex-row gap-2 items-center">
			<span class="w-3 h-3 rounded-full bg-blue-500"></span>
			<span class="text-muted">Processing: {statusCounts.processing}</span>
		</div>
		<div class="flex flex-row gap-2 items-center">
			<span class="w-3 h-3 rounded-full bg-yellow-500"></span>
			<span class="text-muted">Warning: {statusCounts.warning}</span>
		</div>
		<div class="flex flex-row gap-2 items-center">
			<span class="w-3 h-3 rounded-full bg-red-500"></span>
			<span class="text-muted">Error: {statusCounts.error}</span>
		</div>
		<div class="flex flex-row gap-2 items-center">
			<span class="w-3 h-3 rounded-full bg-green-500"></span>
			<span class="text-muted">Completed: {statusCounts.completed}</span>
		</div>
	</div>

	<!-- Current Zip Section -->
	<div class="flex flex-col gap-2">
		<h3 class="text-lg font-bold text-app">Current Zip File</h3>
		{#if currentZipName}
			<div class="flex flex-row gap-2 items-center">
				<p class="text-app font-medium">{currentZipName}</p>
				<span
					class="px-2 py-1 rounded text-xs font-semibold {guidedState.currentZip?.status ===
					MangaProcessingStatus.PROCESSING
						? 'bg-blue-500 text-white'
						: guidedState.currentZip?.status === MangaProcessingStatus.COMPLETED
							? 'bg-green-500 text-white'
							: guidedState.currentZip?.status === MangaProcessingStatus.ERROR
								? 'bg-red-500 text-white'
								: guidedState.currentZip?.status === MangaProcessingStatus.WARNING
									? 'bg-yellow-500 text-white'
									: 'bg-gray-500 text-white'}"
				>
					{guidedState.currentZip?.status ?? 'UNKNOWN'}
				</span>
			</div>
			{#if guidedState.currentZip}
				<p class="text-xs text-muted">
					Manga Folder: {guidedState.currentZip.mangaFolderName}
				</p>
			{/if}
		{:else}
			<p class="text-muted">No zip file selected</p>
		{/if}
	</div>

	<!-- Next Zip Button -->
	<div class="flex flex-col gap-2">
		<h3 class="text-lg font-bold text-app">Next Zip File</h3>
		{#if nextZipName}
			<button
				type="button"
				class="btn-primary px-4 py-2"
				onclick={handleNextZip}
				disabled={automationState.enabled}
			>
				Process: {nextZipName}
			</button>
		{:else}
			<p class="text-muted">No more zip files to process</p>
		{/if}
	</div>

	<!-- Zip File Selector (All non-completed zips) -->
	<div class="flex flex-col gap-2">
		<h3 class="text-lg font-bold text-app">Select Zip File</h3>
		{#if unprocessedZipNames.length > 0}
			<div class={automationState.enabled ? 'opacity-50 pointer-events-none' : ''}>
				<DropdownSingleSelector
					items={unprocessedZipNames}
					bind:selectedItem={selectedZipName}
					class="w-full"
				/>
			</div>
		{:else}
			<p class="text-muted">All zip files have been completed</p>
		{/if}
	</div>

	<!-- Warning Zips Section -->
	{#if warningZipNames.length > 0}
		<div class="flex flex-col gap-2">
			<h3 class="text-lg font-bold text-yellow-600 dark:text-yellow-400">
				⚠️ Warning Zips ({warningZipNames.length})
			</h3>
			<div class="flex flex-col gap-1 max-h-32 overflow-y-auto">
				{#each warningZipNames as zipName}
					<button
						type="button"
						class="text-left text-sm text-yellow-600 dark:text-yellow-400 hover:bg-surface-hover px-2 py-1 rounded"
						onclick={() => handleZipSelect(zipName)}
						disabled={automationState.enabled}
					>
						{zipName}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Error Zips Section -->
	{#if errorZipNames.length > 0}
		<div class="flex flex-col gap-2">
			<h3 class="text-lg font-bold text-red-600 dark:text-red-400">
				❌ Error Zips ({errorZipNames.length})
			</h3>
			<div class="flex flex-col gap-1 max-h-32 overflow-y-auto">
				{#each errorZipNames as zipName}
					<button
						type="button"
						class="text-left text-sm text-red-600 dark:text-red-400 hover:bg-surface-hover px-2 py-1 rounded"
						onclick={() => handleZipSelect(zipName)}
						disabled={automationState.enabled}
					>
						{zipName}
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>

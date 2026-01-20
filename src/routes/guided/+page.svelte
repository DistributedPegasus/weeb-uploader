<script lang="ts">
	import GuidedFolderSelector from '$lib/components/GuidedComponents/GuidedFolderSelector.svelte';
	import MangaFolderSelector from '$lib/components/GuidedComponents/MangaFolderSelector.svelte';
	import MangaProcessingTabs from '$lib/components/GuidedComponents/MangaProcessingTabs.svelte';
	import MangaProcessor from '$lib/components/GuidedComponents/MangaProcessor.svelte';
	import type { ProcessingStatus } from '$lib/components/GuidedComponents/MangaProcessor.svelte';
	import {
		GuidedState,
		GuidedWorkflowStep,
		MangaProcessingStatus,
		guidedStateContext,
		AutomationState,
		automationStateContext
	} from '$lib/components/GuidedComponents/GuidedState.svelte';
	import {
		CompletedIdsState,
		completedIdsStateContext
	} from '$lib/components/GuidedComponents/CompletedIdsState.svelte';
	import { apiAuthContext, ApiAuthContext } from '$lib/core/GlobalState.svelte';
	import { setContext, onMount } from 'svelte';
	import ThemeToggle from '$lib/components/Common/ThemeToggle.svelte';
	import TargetingAuthValidator from '$lib/components/TargetingComponents/TargetingAuthValidator.svelte';
	import CompletedWeebdexIdsViewer from '$lib/components/GuidedComponents/CompletedWeebdexIdsViewer.svelte';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';

	// Set up contexts
	const guidedState = new GuidedState();
	const automationState = new AutomationState();
	const completedIdsState = new CompletedIdsState();
	setContext(guidedStateContext, guidedState);
	setContext(automationStateContext, automationState);
	setContext(completedIdsStateContext, completedIdsState);
	setContext(apiAuthContext, new ApiAuthContext());

	let currentZipFile = $state<File | null>(null);
	let mangaProcessorRef = $state<MangaProcessor | null>(null);

	// Store session timestamp on first load
	let sessionTimestamp = $state<string | null>(null);

	// Initialize session timestamp on page load (new timestamp each time page loads)
	onMount(() => {
		// Create new timestamp (ISO format) for this page load
		sessionTimestamp = new Date().toISOString();
	});

	function onFolderSelectionDone() {
		guidedState.workflowStep = GuidedWorkflowStep.SELECTING_MANGA_FOLDERS;
	}

	function onMangaSelectionDone() {
		guidedState.workflowStep = GuidedWorkflowStep.PROCESSING_MANGA;
		// Move to first selected zip file
		if (guidedState.selectedZipFiles.length > 0) {
			const firstZipFile = guidedState.selectedZipFiles[0];
			const index = guidedState.zipFiles.findIndex((z) => z.file === firstZipFile);
			if (index >= 0) {
				guidedState.currentZipIndex = index;
				currentZipFile = firstZipFile;
			}
		}
	}

	function onZipSelected(zipFile: File) {
		currentZipFile = zipFile;
		// Don't set status to PROCESSING here - that should only happen when upload actually starts
		// (handled in MangaProcessor.startUpload())
	}

	async function onProcessingComplete(status: ProcessingStatus, weebdexId?: string) {
		const currentZip = guidedState.currentZip;
		if (currentZip) {
			// Update status based on processing result
			if (status === 'success') {
				guidedState.setZipStatus(currentZip.file, MangaProcessingStatus.COMPLETED);
				// Save weebdex ID using the state component (now async)
				if (weebdexId && sessionTimestamp) {
					await completedIdsState.addCompletedId(sessionTimestamp, weebdexId);
				}
			} else if (status === 'warning') {
				guidedState.setZipStatus(currentZip.file, MangaProcessingStatus.WARNING);
			} else if (status === 'error') {
				guidedState.setZipStatus(currentZip.file, MangaProcessingStatus.ERROR);
			}
		}

		// Move to next zip file automatically
		// Automation mode will continue checking when the new zip is ready
		if (guidedState.moveToNextZip()) {
			const next = guidedState.currentZip;
			if (next) {
				currentZipFile = next.file;
				// Don't set status to PROCESSING here - that should only happen when upload actually starts
				// (handled in MangaProcessor.startUpload())
			}
		} else {
			// All done
			currentZipFile = null;
		}
	}

	function onAutomationRequestUpload() {
		// Automation mode wants to start upload
		if (mangaProcessorRef) {
			mangaProcessorRef.startUpload();
		}
	}

	const authSettingsVisible = $derived(
		guidedState.workflowStep !== GuidedWorkflowStep.PROCESSING_MANGA
	);
</script>

<div class="container mx-auto p-6 flex flex-col gap-6">
	<div class="flex flex-row justify-between items-center">
		<h1 class="text-xl font-bold text-app">Guided Zip Manga Uploader</h1>
		<div class="flex flex-row gap-2 items-center">
			<button
				type="button"
				class="btn-base btn-primary px-4 py-2"
				onclick={() => goto(resolve('/'))}
			>
				Simple Mode
			</button>
			<button
				type="button"
				class="btn-base btn-primary px-4 py-2"
				onclick={() => goto(resolve('/chapter-editor'))}
			>
				Chapter Editor
			</button>
			<ThemeToggle />
		</div>
	</div>

	<a href={resolve('/docs')} target="_blank" class="link-primary"> Tutorial & Docs </a>

	{#if authSettingsVisible}
		<TargetingAuthValidator />
	{/if}

	<CompletedWeebdexIdsViewer />

	{#if guidedState.workflowStep === GuidedWorkflowStep.SELECTING_ROOT_FOLDER}
		<GuidedFolderSelector
			{guidedState}
			onDone={onFolderSelectionDone}
			class="w-full max-w-md mx-auto"
		/>
	{:else if guidedState.workflowStep === GuidedWorkflowStep.SELECTING_MANGA_FOLDERS}
		<MangaFolderSelector
			{guidedState}
			onDone={onMangaSelectionDone}
			class="w-full max-w-4xl mx-auto"
		/>
	{:else if guidedState.workflowStep === GuidedWorkflowStep.PROCESSING_MANGA}
		<div class="flex flex-col gap-4">
			<MangaProcessingTabs
				{guidedState}
				{onZipSelected}
				{onAutomationRequestUpload}
				{mangaProcessorRef}
				class="w-full"
			/>

			{#if currentZipFile}
				<MangaProcessor
					{guidedState}
					zipFile={currentZipFile}
					{onProcessingComplete}
					bind:this={mangaProcessorRef}
					class="w-full"
				/>
			{:else}
				<div class="bg-surface rounded-md p-4">
					<p class="text-muted">
						No zip file selected. Use the tabs above to select a zip file to process.
					</p>
				</div>
			{/if}
		</div>
	{/if}
</div>

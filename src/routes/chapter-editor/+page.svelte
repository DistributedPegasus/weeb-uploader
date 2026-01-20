<script lang="ts">
	import TargetingAuthValidator from '$lib/components/TargetingComponents/TargetingAuthValidator.svelte';
	import TargetingSeriesSearch from '$lib/components/TargetingComponents/TargetingSeriesSearch.svelte';
	import TargetingSeriesValidator from '$lib/components/TargetingComponents/TargetingSeriesValidator.svelte';
	import ChapterEditorList from '$lib/components/ChapterEditorComponents/ChapterEditorList.svelte';
	import ChapterEditorBatchEdit from '$lib/components/ChapterEditorComponents/ChapterEditorBatchEdit.svelte';
	import ChapterEditorProcessor from '$lib/components/ChapterEditorComponents/ChapterEditorProcessor.svelte';
	import { ProcessingStep } from '$lib/core/ChapterEditorState.svelte';
	import { ChapterEditorState } from '$lib/core/ChapterEditorState.svelte';
	import { apiAuthContext, ApiAuthContext } from '$lib/core/GlobalState.svelte';
	import {
		TargetingState,
		targetingStateContext
	} from '$lib/components/TargetingComponents/TargetingState.svelte';
	import { getContext, setContext } from 'svelte';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import ThemeToggle from '$lib/components/Common/ThemeToggle.svelte';
	import { ScanGroup } from '$lib/core/UploadingState.svelte';

	setContext(apiAuthContext, new ApiAuthContext());
	// Create TargetingState context for series search/validator components
	const targetingState = new TargetingState();
	setContext(targetingStateContext, targetingState);

	const editorState = new ChapterEditorState();
	const authContext = getContext<ApiAuthContext>(apiAuthContext)!;

	let availableGroups = $state<ScanGroup[]>([]);
	let processorRef = $state<ChapterEditorProcessor | null>(null);

	// Sync seriesId from TargetingState to ChapterEditorState
	$effect(() => {
		editorState.seriesId = targetingState.seriesId;
	});

	// Sync availableGroups to TargetingState so TargetingEditableGroup can use them
	$effect(() => {
		targetingState.availableScanGroups = availableGroups;
	});

	function saveAllModified() {
		if (processorRef) {
			processorRef.saveAllModified();
		}
	}

	function revertAllModified() {
		if (processorRef) {
			processorRef.revertAllModified();
		}
	}
</script>

<div class="container mx-auto p-6 flex flex-col gap-6">
	<div class="flex flex-row justify-between items-center">
		<h1 class="text-xl font-bold text-app">Chapter Mass Editor</h1>
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
				onclick={() => goto(resolve('/guided'))}
			>
				Guided Mode
			</button>
			<ThemeToggle />
		</div>
	</div>

	<a href={resolve('/docs')} target="_blank" class="link-primary"> Tutorial & Docs </a>

	<TargetingAuthValidator />

	<ChapterEditorProcessor {editorState} bind:availableGroups bind:this={processorRef} />

	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-2">
			<div class="flex flex-row items-center justify-between">
				<h2 class="text-lg font-semibold text-app">Series Selection</h2>
				<button
					type="button"
					onclick={() => {
						editorState.permissionOverride = !editorState.permissionOverride;
						if (processorRef) {
							processorRef.reloadChapters();
						}
					}}
					class="flex flex-row cursor-pointer items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors {editorState.permissionOverride
						? 'bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-400 dark:hover:bg-yellow-500 text-white dark:text-gray-900'
						: 'bg-surface-hover hover:bg-surface-border text-app border border-surface-border'}"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						{#if editorState.permissionOverride}
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						{:else}
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
							/>
						{/if}
					</svg>
					<span>
						{editorState.permissionOverride ? 'Override Enabled' : 'Override Permissions'}
					</span>
				</button>
			</div>
			<TargetingSeriesValidator />
			<TargetingSeriesSearch />
		</div>

		{#if editorState.seriesId}
			<div class="flex flex-col gap-4">
				<ChapterEditorBatchEdit {editorState} bind:availableGroups />

				{#if editorState.processingStep === ProcessingStep.LOADING}
					<p class="text-app">Loading chapters...</p>
				{:else if editorState.loadError}
					<p class="text-red-500 dark:text-red-400">{editorState.loadError}</p>
				{:else if editorState.processingStep === ProcessingStep.LOADED && editorState.chapters.length > 0}
					<div class="flex flex-col gap-2">
						<div class="flex flex-row items-center justify-between">
							<div class="flex flex-col gap-1">
								<h2 class="text-lg font-semibold text-app">Chapters</h2>
								{#if editorState.permissionOverride}
									<span
										class="text-xs text-yellow-500 dark:text-yellow-400 font-semibold bg-yellow-500/10 dark:bg-yellow-500/5 px-2 py-1 rounded w-fit"
									>
										All chapters visible (override enabled)
									</span>
								{/if}
								{#if editorState.filteredChaptersCount > 0 && !editorState.permissionOverride}
									<p class="text-sm text-yellow-500 dark:text-yellow-400">
										{editorState.filteredChaptersCount}
										{editorState.filteredChaptersCount === 1 ? 'chapter' : 'chapters'} hidden due to
										insufficient permissions
									</p>
								{/if}
							</div>
							{#if editorState.getModifiedChapters().length > 0}
								<div class="flex flex-row gap-2 items-center">
									<button
										type="button"
										onclick={revertAllModified}
										disabled={editorState.isSavingAll}
										class="btn-neutral px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
									>
										Revert All ({editorState.getModifiedChapters().length})
									</button>
									<button
										type="button"
										onclick={saveAllModified}
										disabled={editorState.isSavingAll || !authContext.apiToken}
										class="btn-primary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
									>
										{#if editorState.isSavingAll}
											Saving... ({editorState.saveProgress?.current ?? 0} / {editorState
												.saveProgress?.total ?? 0})
										{:else}
											Save All Modified ({editorState.getModifiedChapters().length})
										{/if}
									</button>
								</div>
							{/if}
						</div>
						<ChapterEditorList {editorState} {availableGroups} />
					</div>
				{:else if editorState.filteredChaptersCount > 0}
					<div class="flex flex-col gap-2">
						<p class="text-muted">No accessible chapters found for this series.</p>
						<p class="text-sm text-yellow-500 dark:text-yellow-400">
							{editorState.filteredChaptersCount}
							{editorState.filteredChaptersCount === 1 ? 'chapter' : 'chapters'}
							{editorState.filteredChaptersCount === 1 ? 'was' : 'were'} filtered out due to insufficient
							permissions.
						</p>
					</div>
				{:else if editorState.processingStep === ProcessingStep.LOADED}
					<p class="text-muted">No chapters found for this series.</p>
				{/if}
			</div>
		{:else}
			<p class="text-muted">Please select a series to begin editing chapters.</p>
		{/if}
	</div>
</div>

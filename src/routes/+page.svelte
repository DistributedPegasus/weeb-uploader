<script lang="ts">
	import FolderSelector from '$lib/components/FolderSelectorComponents/FolderSelector.svelte';
	import TargetingAuthValidator from '$lib/components/TargetingComponents/TargetingAuthValidator.svelte';
	import TargetingPreparation from '$lib/components/TargetingComponents/TargetingPreparation.svelte';
	import {
		TargetingState,
		targetingStateContext
	} from '$lib/components/TargetingComponents/TargetingState.svelte';
	import UploaderOrchestrator from '$lib/components/UploaderComponents/UploaderOrchestrator.svelte';
	import VerticalSlice from '$lib/components/VerticalSlicerComponents/VerticalSlice.svelte';
	import ThemeToggle from '$lib/components/Common/ThemeToggle.svelte';
	import { apiAuthContext, ApiAuthContext } from '$lib/core/GlobalState.svelte';
	import type { SelectedFolder } from '$lib/core/GroupedFolders';
	import { getContext, setContext } from 'svelte';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';

	let selectedFiles = $state<File[] | null>(null);
	let finalizedFolderSelection = $state<SelectedFolder[] | null>(null);

	setContext(apiAuthContext, new ApiAuthContext());
	setContext(targetingStateContext, new TargetingState());

	enum EDITOR_STATE {
		PICKING_FOLDER = 'PICKING_FOLDER',
		SELECTING_FOLDERS = 'SELECTING_FOLDERS',
		EDITING_CHAPTERS = 'EDITING_CHAPTERS',
		UPLOADING = 'UPLOADING',
		FINISHED = 'FINISHED'
	}

	let working = $state(false);
	let editorState = $state<EDITOR_STATE>(EDITOR_STATE.PICKING_FOLDER);
	let disableSwitching = $derived(editorState === EDITOR_STATE.UPLOADING && working);
	let authSettingsVisible = $derived(
		editorState !== EDITOR_STATE.UPLOADING && editorState !== EDITOR_STATE.EDITING_CHAPTERS
	);

	function switchEditorState(state: EDITOR_STATE) {
		if (selectedFiles) {
			editorState = state;
		}
	}

	function onFolderSelectionDone() {
		editorState = EDITOR_STATE.SELECTING_FOLDERS;
	}

	function onFolderSelectionSliceDone() {
		editorState = EDITOR_STATE.EDITING_CHAPTERS;
	}

	function onChapterEditingDone() {
		editorState = EDITOR_STATE.UPLOADING;
	}

	function onUploadingDone(success: boolean) {
		if (success) {
			editorState = EDITOR_STATE.FINISHED;
		}
	}
</script>

<div class="container mx-auto p-6 flex flex-col gap-6">
	<div class="flex flex-row justify-between items-center">
		<h1 class="text-xl font-bold text-app">Uploader Improved</h1>
		<div class="flex flex-row gap-2 items-center">
			<button
				type="button"
				class="btn-base btn-primary px-4 py-2"
				onclick={() => goto(resolve('/guided'))}
			>
				Guided Mode
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

	<div class="flex flex-row gap-1">
		<button
			type="button"
			class={{
				'btn-base': true,
				'btn-neutral': editorState !== EDITOR_STATE.PICKING_FOLDER,
				'btn-primary-active': editorState === EDITOR_STATE.PICKING_FOLDER
			}}
			disabled={disableSwitching}
			onclick={() => switchEditorState(EDITOR_STATE.PICKING_FOLDER)}
		>
			Pick Folder
		</button>

		<div class="i-mdi-menu-right h-10 text-app"></div>

		<button
			type="button"
			class={{
				'btn-base': true,
				'btn-neutral': editorState !== EDITOR_STATE.SELECTING_FOLDERS,
				'btn-primary-active': editorState === EDITOR_STATE.SELECTING_FOLDERS
			}}
			disabled={!selectedFiles || disableSwitching}
			onclick={() => switchEditorState(EDITOR_STATE.SELECTING_FOLDERS)}>Select Folders</button
		>

		<div class="i-mdi-menu-right h-10 text-app"></div>

		<button
			type="button"
			class={{
				'btn-base': true,
				'btn-neutral': editorState !== EDITOR_STATE.EDITING_CHAPTERS,
				'btn-primary-active': editorState === EDITOR_STATE.EDITING_CHAPTERS
			}}
			disabled={!finalizedFolderSelection || disableSwitching}
			onclick={() => switchEditorState(EDITOR_STATE.EDITING_CHAPTERS)}>Edit Chapters</button
		>

		<div class="i-mdi-menu-right h-10 text-app"></div>

		<button
			type="button"
			class={{
				'btn-base': true,
				'btn-neutral': editorState !== EDITOR_STATE.UPLOADING,
				'btn-primary-active': editorState === EDITOR_STATE.UPLOADING
			}}
			disabled={!finalizedFolderSelection || disableSwitching}
			onclick={() => switchEditorState(EDITOR_STATE.UPLOADING)}>Upload</button
		>

		<div class="i-mdi-menu-right h-10 text-app"></div>

		<button
			type="button"
			class={{
				'btn-base': true,
				'btn-neutral': editorState !== EDITOR_STATE.FINISHED,
				'btn-primary-active': editorState === EDITOR_STATE.FINISHED
			}}
			disabled={true}>Finished</button
		>
	</div>

	{#if editorState === EDITOR_STATE.PICKING_FOLDER}
		<FolderSelector
			onDone={onFolderSelectionDone}
			bind:selectedFiles
			class="w-full max-w-md mx-auto"
		/>
	{:else if editorState === EDITOR_STATE.SELECTING_FOLDERS}
		<VerticalSlice
			onDone={onFolderSelectionSliceDone}
			{selectedFiles}
			bind:finalizedFolderSelection
		/>
	{:else if editorState === EDITOR_STATE.EDITING_CHAPTERS && finalizedFolderSelection}
		<TargetingPreparation
			selectedFolders={finalizedFolderSelection}
			onDone={onChapterEditingDone}
		/>
	{:else if editorState === EDITOR_STATE.UPLOADING}
		<UploaderOrchestrator onDone={onUploadingDone} bind:busy={working} />
	{:else if editorState === EDITOR_STATE.FINISHED}
		<p>Upload completed successfully</p>
		<p>
			You can click on any of the step tabs above to navigate to it. But you'll most likely just be
			uploading another manga, meaning you'll navigate to "Pick Folder".
		</p>
	{/if}
</div>

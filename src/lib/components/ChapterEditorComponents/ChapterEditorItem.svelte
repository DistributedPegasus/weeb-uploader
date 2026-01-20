<script lang="ts">
	import type { EditableChapter, ChapterEditorState } from '$lib/core/ChapterEditorState.svelte';
	import { getContext } from 'svelte';
	import { apiAuthContext, ApiAuthContext } from '$lib/core/GlobalState.svelte';
	import { updateChapter, deleteChapter } from '../TargetingComponents/TargetingState.svelte';
	import { ScanGroup } from '$lib/core/UploadingState.svelte';
	import DropdownMultiSelector from '../Common/DropdownMultiSelector.svelte';
	import TargetingEditableField from '../TargetingComponents/TargetingEditableField.svelte';
	import TargetingEditableGroup from '../TargetingComponents/TargetingEditableGroup.svelte';
	import { ChapterUploadingGroup } from '$lib/core/UploadingState.svelte';
	import DropdownSingleSelector from '../Common/DropdownSingleSelector.svelte';
	import { languages, getLanguageDisplayText } from '../TargetingComponents/LanguageOptions.svelte';

	interface Props {
		index: number;
		chapter: EditableChapter;
		editorState: ChapterEditorState;
		availableGroups: ScanGroup[];
		class?: string;
	}

	let { index, chapter, editorState, availableGroups, class: className = '' }: Props = $props();

	const authContext = getContext<ApiAuthContext>(apiAuthContext);
	if (!authContext) {
		throw new Error(
			'ChapterEditorItem must be used within a component that provides ApiAuthContext context'
		);
	}

	// Create a wrapper object for groups that TargetingEditableGroup expects
	// Initialize from chapter data
	function getGroupIds() {
		if (chapter.modified.groups !== undefined) {
			return chapter.modified.groups;
		}
		const chapterGroups = chapter.original.relationships?.groups;
		if (chapterGroups && Array.isArray(chapterGroups)) {
			return chapterGroups.map((g) => g.id);
		}
		return [];
	}

	let groupWrapper = $state(new ChapterUploadingGroup());

	// Initialize groupIds
	$effect(() => {
		groupWrapper.groupIds = getGroupIds();
	});

	// Sync groupWrapper changes back to chapter (one-way: user input -> editorState)
	$effect(() => {
		const currentIds = groupWrapper.groupIds ?? [];
		const currentIdsSorted = [...currentIds].sort();

		// Get what's currently in the chapter
		const chapterGroupIds = getGroupIds();
		const chapterGroupIdsSorted = [...chapterGroupIds].sort();

		// Only update if different
		if (JSON.stringify(currentIdsSorted) !== JSON.stringify(chapterGroupIdsSorted)) {
			editorState.updateChapterField(chapter.id, 'groups', currentIds);
		}
	});

	// Sync from chapter to groupWrapper when chapter changes (one-way: chapter -> UI)
	$effect(() => {
		const targetGroupIds = getGroupIds();
		const currentIds = groupWrapper.groupIds ?? [];
		const currentIdsSorted = [...currentIds].sort();
		const targetIdsSorted = [...targetGroupIds].sort();

		if (JSON.stringify(currentIdsSorted) !== JSON.stringify(targetIdsSorted)) {
			groupWrapper.groupIds = targetGroupIds;
		}
	});

	function getCurrentValue(field: 'title' | 'volume' | 'chapter'): string | null {
		const modified = chapter.modified[field];
		if (modified !== undefined) {
			return modified as string | null;
		}
		const originalValue = chapter.original[field];
		return originalValue !== undefined ? (originalValue as string | null) : null;
	}

	function getCurrentLanguage(): string {
		const modified = chapter.modified.language;
		if (modified !== undefined) {
			return modified;
		}
		return chapter.original.language;
	}

	// Local state that syncs from chapter (one-way: chapter -> UI)
	// Ensure these are always string | null, never undefined
	let currentTitle = $state<string | null>(getCurrentValue('title') ?? null);
	let currentVolume = $state<string | null>(getCurrentValue('volume') ?? null);
	let currentChapterNum = $state<string | null>(getCurrentValue('chapter') ?? null);
	let currentLanguage = $state<string>(getCurrentLanguage());

	// Track what we last set to prevent loops
	let lastSetTitle = $state<string | null>(getCurrentValue('title') ?? null);
	let lastSetVolume = $state<string | null>(getCurrentValue('volume') ?? null);
	let lastSetChapter = $state<string | null>(getCurrentValue('chapter') ?? null);
	let lastSetLanguage = $state<string>(getCurrentLanguage());

	// Sync from chapter to local state when chapter changes externally
	$effect(() => {
		const newTitle = getCurrentValue('title') ?? null;
		const newVolume = getCurrentValue('volume') ?? null;
		const newChapter = getCurrentValue('chapter') ?? null;
		const newLanguage = getCurrentLanguage();

		// Only update if different from both current value AND what we last set
		// This prevents loops when we update editorState which updates chapter.modified
		if (newTitle !== currentTitle && newTitle !== lastSetTitle) {
			currentTitle = newTitle;
		}
		if (newVolume !== currentVolume && newVolume !== lastSetVolume) {
			currentVolume = newVolume;
		}
		if (newChapter !== currentChapterNum && newChapter !== lastSetChapter) {
			currentChapterNum = newChapter;
		}
		if (newLanguage !== currentLanguage && newLanguage !== lastSetLanguage) {
			currentLanguage = newLanguage;
		}
	});

	// Update editorState when local state changes (one-way: UI -> editorState)
	$effect(() => {
		if (currentTitle !== lastSetTitle) {
			editorState.updateChapterField(chapter.id, 'title', currentTitle);
			lastSetTitle = currentTitle;
		}
	});

	$effect(() => {
		if (currentVolume !== lastSetVolume) {
			editorState.updateChapterField(chapter.id, 'volume', currentVolume);
			lastSetVolume = currentVolume;
		}
	});

	$effect(() => {
		if (currentChapterNum !== lastSetChapter) {
			editorState.updateChapterField(chapter.id, 'chapter', currentChapterNum);
			lastSetChapter = currentChapterNum;
		}
	});

	$effect(() => {
		if (currentLanguage !== lastSetLanguage) {
			editorState.updateChapterField(chapter.id, 'language', currentLanguage);
			lastSetLanguage = currentLanguage;
		}
	});

	function revertChapter() {
		editorState.resetChapter(chapter.id);
		// Reset local state to original values (ensure never undefined)
		const originalTitle = chapter.original.title ?? null;
		const originalVolume = chapter.original.volume ?? null;
		const originalChapter = chapter.original.chapter ?? null;
		const originalLanguage = chapter.original.language;

		currentTitle = originalTitle;
		currentVolume = originalVolume;
		currentChapterNum = originalChapter;
		currentLanguage = originalLanguage;

		lastSetTitle = originalTitle;
		lastSetVolume = originalVolume;
		lastSetChapter = originalChapter;
		lastSetLanguage = originalLanguage;

		// groupWrapper will sync automatically via effect
	}

	async function saveChapter() {
		if (!authContext.apiToken) {
			editorState.updateChapterSaveStatus(chapter.id, 'error', 'No API token available');
			return;
		}

		editorState.updateChapterSaveStatus(chapter.id, 'saving');

		try {
			const updateData = editorState.getChapterUpdateData(chapter);
			const updated = await updateChapter(chapter.id, updateData, authContext.apiToken);

			// Update the chapter after successful save
			editorState.updateChapterAfterSave(chapter.id, updated);

			// Clear saved status after a delay
			setTimeout(() => {
				const currentChapter = editorState.chapters.find((ch) => ch.id === chapter.id);
				if (currentChapter && currentChapter.saveStatus === 'saved' && !currentChapter.isModified) {
					editorState.updateChapterSaveStatus(chapter.id, 'pending');
				}
			}, 2000);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to save chapter';
			editorState.updateChapterSaveStatus(chapter.id, 'error', errorMessage);
		}
	}

	async function deleteChapterHandler() {
		if (!authContext.apiToken) {
			editorState.updateChapterDeleteStatus(chapter.id, 'error', 'No API token available');
			return;
		}

		// Confirm deletion
		if (
			!confirm(
				`Are you sure you want to delete chapter ${chapter.id}? This action cannot be undone.`
			)
		) {
			return;
		}

		editorState.updateChapterDeleteStatus(chapter.id, 'deleting');

		try {
			await deleteChapter(chapter.id, authContext.apiToken);
			editorState.updateChapterDeleteStatus(chapter.id, 'deleted');
			// Remove the chapter from the list after a short delay
			setTimeout(() => {
				editorState.removeChapter(chapter.id);
			}, 1000);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Failed to delete chapter';
			editorState.updateChapterDeleteStatus(chapter.id, 'error', errorMessage);
		}
	}
</script>

<div
	class="bg-surface-hover rounded-md p-3 flex flex-col gap-2 {chapter.isModified
		? 'border-2 border-yellow-500 bg-yellow-500/10 dark:bg-yellow-500/5'
		: 'border-surface'} {chapter.saveStatus === 'saving' ? 'opacity-75' : ''} {className}"
>
	<div class="flex flex-row gap-4 items-center justify-between">
		<div class="flex flex-row gap-4 items-center">
			<span class="text-sm font-bold text-app">#{index + 1}</span>
			<span class="text-xs text-muted">ID: {chapter.id}</span>
			{#if chapter.isModified}
				<span class="text-xs text-yellow-500 dark:text-yellow-400 font-semibold">* Modified</span>
			{/if}
			{#if chapter.deleteStatus === 'deleting'}
				<span class="text-xs text-orange-500 dark:text-orange-400">Deleting...</span>
			{:else if chapter.deleteStatus === 'deleted'}
				<span class="text-xs text-green-500 dark:text-green-400">Deleted</span>
			{:else if chapter.deleteStatus === 'error'}
				<span class="text-xs text-red-500 dark:text-red-400">Delete Error</span>
			{:else if chapter.saveStatus === 'saving'}
				<span class="text-xs text-blue-500 dark:text-blue-400">Saving...</span>
			{:else if chapter.saveStatus === 'saved'}
				<span class="text-xs text-green-500 dark:text-green-400">Saved</span>
			{:else if chapter.saveStatus === 'error'}
				<span class="text-xs text-red-500 dark:text-red-400">Error</span>
			{/if}
			<div class="flex flex-row gap-2 items-center">
				<span class="text-xs text-muted">Vol:</span>
				<TargetingEditableField
					bind:value={currentVolume}
					textClass="text-sm text-app"
					fieldName="volume"
				/>
			</div>
			<div class="flex flex-row gap-2 items-center">
				<span class="text-xs text-muted">Ch:</span>
				<TargetingEditableField
					bind:value={currentChapterNum}
					textClass="text-sm text-app"
					fieldName="chapter"
				/>
			</div>
		</div>
		<div class="flex flex-row gap-2 items-center">
			{#if chapter.isModified}
				<button
					type="button"
					onclick={revertChapter}
					disabled={chapter.saveStatus === 'saving' || chapter.deleteStatus === 'deleting'}
					class="btn-neutral px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Revert
				</button>
			{/if}
			<button
				type="button"
				onclick={saveChapter}
				disabled={!chapter.isModified ||
					chapter.saveStatus === 'saving' ||
					chapter.deleteStatus === 'deleting'}
				class="btn-primary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{#if chapter.saveStatus === 'saving'}
					Saving...
				{:else if chapter.saveStatus === 'saved'}
					Saved
				{:else}
					Save
				{/if}
			</button>
			<button
				type="button"
				onclick={deleteChapterHandler}
				disabled={chapter.saveStatus === 'saving' ||
					chapter.deleteStatus === 'deleting' ||
					chapter.deleteStatus === 'deleted'}
				class="btn-danger px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{#if chapter.deleteStatus === 'deleting'}
					Deleting...
				{:else if chapter.deleteStatus === 'deleted'}
					Deleted
				{:else}
					Delete
				{/if}
			</button>
		</div>
	</div>

	<div class="flex flex-row gap-2 items-center">
		<span class="text-xs text-muted">Title:</span>
		<div class="flex flex-row gap-2 items-center flex-1">
			<TargetingEditableField
				bind:value={currentTitle}
				textClass="text-sm text-app font-medium"
				fieldName="title"
			/>
		</div>
	</div>

	<div class="flex flex-row gap-2 items-center">
		<span class="text-xs text-muted">Language:</span>
		<DropdownSingleSelector
			items={languages.map((l) => l.id)}
			bind:selectedItem={currentLanguage}
			getDisplayText={(id) => {
				const lang = languages.find((l) => l.id === id);
				return lang ? getLanguageDisplayText(lang) : id;
			}}
			class="text-sm"
		/>
	</div>

	<div class="flex flex-row gap-2 items-center">
		<span class="text-xs text-muted">Groups:</span>
		<TargetingEditableGroup bind:groups={groupWrapper} fieldName="groups" />
	</div>

	{#if chapter.error}
		<p class="text-xs text-red-500 dark:text-red-400">{chapter.error}</p>
	{/if}
</div>

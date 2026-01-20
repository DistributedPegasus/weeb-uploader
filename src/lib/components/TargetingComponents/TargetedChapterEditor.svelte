<script lang="ts">
	import type { ChapterState } from '$lib/core/UploadingState.svelte';
	import { getContext } from 'svelte';
	import { TargetingState, targetingStateContext } from './TargetingState.svelte';
	import TargetingEditableField from './TargetingEditableField.svelte';
	import TargetedImageEditor from './TargetedImageEditor.svelte';
	import TargetingEditableGroup from './TargetingEditableGroup.svelte';
	import DropdownSingleSelector from '../Common/DropdownSingleSelector.svelte';
	import { languages, getLanguageDisplayText } from './LanguageOptions.svelte';

	const targetingState = getContext<TargetingState>(targetingStateContext);
	if (!targetingState) {
		throw new Error(
			'TargetedChapterEditor must be used within a component that provides TargetingState context'
		);
	}

	interface Props {
		index: number;
		chapter: ChapterState;
		class?: string;
	}

	const { index, chapter: ch = $bindable(), class: className }: Props = $props();

	let isExpanded = $state(false);
	let languageInitialized = $state(false);

	$effect(() => {
		// Store original language value on mount if not already stored
		if (!languageInitialized && ch) {
			if (!ch.originalFieldValues.has('language')) {
				ch.originalFieldValues.set('language', ch.language);
			}
			languageInitialized = true;
		}
	});

	$effect(() => {
		// Track when language changes - mark as manually edited if different from original
		if (languageInitialized && ch && ch.originalFieldValues.has('language')) {
			const originalValue = ch.originalFieldValues.get('language') as string;
			if (ch.language !== originalValue && !ch.manuallyEditedFields.has('language')) {
				ch.manuallyEditedFields.add('language');
			}
		}
	});

	function toggleExpanded() {
		isExpanded = !isExpanded;
	}

	function revertField(fieldName: string) {
		if (ch.originalFieldValues.has(fieldName)) {
			const originalValue = ch.originalFieldValues.get(fieldName);

			if (fieldName === 'title') {
				ch.chapterTitle = originalValue as string | null;
			} else if (fieldName === 'volume') {
				ch.chapterVolume = originalValue as string | null;
			} else if (fieldName === 'chapterNumber') {
				ch.chapterNumber = originalValue as string | null;
			} else if (fieldName === 'groups') {
				ch.associatedGroup.groupIds = originalValue ? [...(originalValue as string[])] : null;
			} else if (fieldName === 'language') {
				ch.language = originalValue as string;
			}

			ch.manuallyEditedFields.delete(fieldName);
			ch.originalFieldValues.delete(fieldName);
		}
	}

	function deleteChapter() {
		ch.isDeleted = !ch.isDeleted;
	}
</script>

<div
	class={[
		'flex flex-col gap-2 justify-between overflow-clip rounded-lg bg-surface-hover',
		className
	]}
>
	<!-- Chapter header -->
	<div class="flex flex-row items-center justify-between w-full px-2 py-1 gap-2">
		<div class="flex flex-col gap-2 flex-1">
			<!-- Index, Volume, chapter number, and Groups -->
			<div class="flex flex-row gap-2 items-center">
				<span class="text-sm text-muted mr-3">{index + 1}.</span>

				<div class="flex flex-row gap-2 items-center">
					<span class="text-sm text-muted">Vol.</span>
					<TargetingEditableField
						bind:value={ch.chapterVolume}
						textClass="text-sm text-muted"
						fieldName="volume"
						chapter={ch}
					/>
					{#if ch.manuallyEditedFields.has('volume')}
						<button
							type="button"
							onclick={(e) => {
								e.stopPropagation();
								revertField('volume');
							}}
							class="cursor-pointer bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-400 dark:hover:bg-yellow-500 text-white rounded-md px-1 py-0.5 text-xs"
							title="Revert manual edit"
						>
							<div class="i-mdi-undo h-4 w-4"></div>
						</button>
					{/if}
				</div>
				<div class="flex flex-row gap-2 items-center">
					<span class="text-sm text-muted">Ch.</span>
					<TargetingEditableField
						bind:value={ch.chapterNumber}
						textClass="text-sm text-muted"
						fieldName="chapterNumber"
						chapter={ch}
					/>
					{#if ch.manuallyEditedFields.has('chapterNumber')}
						<button
							type="button"
							onclick={(e) => {
								e.stopPropagation();
								revertField('chapterNumber');
							}}
							class="cursor-pointer bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-400 dark:hover:bg-yellow-500 text-white rounded-md px-1 py-0.5 text-xs"
							title="Revert manual edit"
						>
							<div class="i-mdi-undo h-4 w-4"></div>
						</button>
					{/if}
				</div>

				<div class="flex flex-row gap-2 items-center">
					<span class="text-sm text-muted">Groups:</span>
					<TargetingEditableGroup
						bind:groups={ch.associatedGroup}
						fieldName="groups"
						chapter={ch}
					/>
					{#if ch.manuallyEditedFields.has('groups')}
						<button
							type="button"
							onclick={(e) => {
								e.stopPropagation();
								revertField('groups');
							}}
							class="cursor-pointer bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-400 dark:hover:bg-yellow-500 text-white rounded-md px-1 py-0.5 text-xs"
							title="Revert manual edit"
						>
							<div class="i-mdi-undo h-4 w-4"></div>
						</button>
					{/if}
				</div>
			</div>

			<!-- Original Folder Path -->
			<div class="flex flex-row gap-2 items-center">
				<span class="text-sm text-muted">Original:</span>
				<p class="text-sm text-muted">{ch.originalFolderPath}</p>
			</div>

			<!-- Title -->
			<div class="flex flex-row gap-2 items-center">
				<span class="text-sm text-muted">Title:</span>
				<TargetingEditableField
					bind:value={ch.chapterTitle}
					class=""
					textClass="text-xl font-bold text-app"
					fieldName="title"
					chapter={ch}
				/>
				{#if ch.manuallyEditedFields.has('title')}
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							revertField('title');
						}}
						class="cursor-pointer bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-400 dark:hover:bg-yellow-500 text-white rounded-md px-1 py-0.5 text-xs"
						title="Revert manual edit"
					>
						<div class="i-mdi-undo h-4 w-4"></div>
					</button>
				{/if}
			</div>

			<!-- Language -->
			<div class="flex flex-row gap-2 items-center">
				<span class="text-sm text-muted">Language:</span>
				<DropdownSingleSelector
					items={languages.map((l) => l.id)}
					bind:selectedItem={ch.language}
					getDisplayText={(id) => {
						const lang = languages.find((l) => l.id === id);
						return lang ? getLanguageDisplayText(lang) : id;
					}}
					class="text-sm"
				/>
				{#if ch.manuallyEditedFields.has('language')}
					<button
						type="button"
						onclick={(e) => {
							e.stopPropagation();
							revertField('language');
						}}
						class="cursor-pointer bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-400 dark:hover:bg-yellow-500 text-white rounded-md px-1 py-0.5 text-xs"
						title="Revert manual edit"
					>
						<div class="i-mdi-undo h-4 w-4"></div>
					</button>
				{/if}
			</div>
		</div>

		<button
			type="button"
			class="flex flex-row items-center justify-center clickable-hint rounded-md w-20 h-20 px-1 py-0.5 text-xs"
			title="Delete chapter"
			onclick={deleteChapter}
		>
			{#if ch.isDeleted}
				<div class="i-mdi-restore h-10 w-10 btn-success"></div>
			{:else}
				<div class="i-mdi-delete h-10 w-10 btn-danger"></div>
			{/if}
		</button>
		<!-- Images preview indicator -->
		<button
			type="button"
			class="flex flex-row items-center justify-center clickable-hint w-20 h-20 rounded-md"
			onclick={toggleExpanded}
		>
			{#if isExpanded}
				<div aria-label="Collapse" class="w-10 h-10 i-mdi-chevron-up text-app"></div>
			{:else}
				<div aria-label="Expand" class="w-10 h-10 i-mdi-chevron-down text-app"></div>
			{/if}
		</button>
	</div>

	<!-- Chapter Images Preview -->
	{#if isExpanded}
		<div class="w-full bg-surface rounded-lg p-2">
			<TargetedImageEditor bind:pages={ch.pages} />
		</div>
	{/if}
</div>

<script lang="ts">
	import type { ChapterState } from '$lib/core/UploadingState.svelte';

	interface Props {
		value: string | null;
		class?: string;
		textClass?: string;
		fieldName?: string;
		chapter?: ChapterState;
	}

	let {
		value: boundValue = $bindable<string | null>(null),
		class: className = '',
		textClass = '',
		fieldName,
		chapter
	}: Props = $props();

	let isEditing = $state(false);
	let editValue = $state<string | null>(null);
	let inputRef = $state<HTMLInputElement | null>(null);

	function startEditing() {
		// Capture original value if tracking is enabled and field isn't already manually edited
		if (chapter && fieldName && !chapter.manuallyEditedFields.has(fieldName)) {
			// Store original value if not already stored
			if (!chapter.originalFieldValues.has(fieldName)) {
				chapter.originalFieldValues.set(fieldName, boundValue);
			}
		}

		isEditing = true;
		editValue = boundValue;
	}

	$effect(() => {
		if (inputRef && isEditing) {
			inputRef.focus();

			window.addEventListener('keydown', handleKeyDown);
		} else {
			window.removeEventListener('keydown', handleKeyDown);
		}
	});

	function stopEditing(commit: boolean) {
		isEditing = false;
		if (commit) {
			boundValue = editValue;
			// Mark field as manually edited when user commits the edit
			if (chapter && fieldName) {
				chapter.manuallyEditedFields.add(fieldName);
			}
		} else {
			editValue = boundValue;
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			stopEditing(false);
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class={['flex flex-row gap-2 items-center', className, { 'grow-1': isEditing }]}
	onclick={(e) => e.stopPropagation()}
>
	{#if isEditing}
		<form
			onsubmit={(e) => {
				e.preventDefault();
				stopEditing(true);
			}}
			class="flex flex-row gap-2 items-center w-full"
		>
			<input bind:this={inputRef} type="text" bind:value={editValue} class="input-base grow-1" />
			<button
				onclick={(e) => {
					e.stopPropagation();
					stopEditing(false);
				}}
				type="button"
				aria-label="Cancel"
				class="btn-danger p-1"
			>
				<div class="i-mdi-close h-5 w-5 text-white"></div>
			</button>
			<button type="submit" aria-label="Save" class="btn-success p-1">
				<div class="i-mdi-check h-5 w-5 text-white"></div>
			</button>
		</form>
	{:else}
		<button
			onclick={(e) => {
				e.stopPropagation();
				startEditing();
			}}
			class={[
				'cursor-pointer hover:text-blue-500 dark:hover:text-blue-400 px-2 min-w-5 min-h-5 bg-surface rounded-md',
				textClass
			]}
		>
			{boundValue ?? '—'}
		</button>
	{/if}
</div>

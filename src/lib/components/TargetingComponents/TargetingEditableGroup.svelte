<script lang="ts">
	import type {
		ChapterUploadingGroup,
		ScanGroup,
		ChapterState
	} from '$lib/core/UploadingState.svelte';
	import { getContext } from 'svelte';
	import DropdownMultiSelector from '../Common/DropdownMultiSelector.svelte';
	import { TargetingState, targetingStateContext } from './TargetingState.svelte';
	import { GroupFormatter } from '$lib/core/GroupFormatter.svelte';

	const targetingState = getContext<TargetingState>(targetingStateContext);
	if (!targetingState) {
		throw new Error(
			'TargetingEditableGroup must be used within a component that provides TargetingState context'
		);
	}

	const availableGroups = $derived(targetingState.availableScanGroups);

	interface Props {
		groups: ChapterUploadingGroup;
		fieldName?: string;
		chapter?: ChapterState;
	}

	let {
		groups: boundGroups = $bindable<ChapterUploadingGroup>(
			null as unknown as ChapterUploadingGroup
		),
		fieldName,
		chapter
	}: Props = $props();

	let isEditing = $state(false);
	let selectedGroups = $state<ScanGroup[] | null>(null);
	let dropdownOpen = $state(false);
	let dropdownTriggerRef: HTMLDivElement | null = $state(null);
	let buttonRef: HTMLButtonElement | null = $state(null);
	let savedButtonRect: DOMRect | null = $state(null);
	let formattedGroupsText = $state<string>('');
	let groupDisplayTextMap = $state<Map<string, string>>(new Map());

	// Format groups with alt names when they change
	$effect(async () => {
		if (!boundGroups.groupIds || boundGroups.groupIds.length === 0) {
			formattedGroupsText = '';
			groupDisplayTextMap = new Map();
			return;
		}

		if (!targetingState.seriesId) {
			// Fall back to simple formatting if no series ID
			const groups = boundGroups.groupIds
				.map((groupId) => {
					const group = availableGroups.find((group) => group.groupId === groupId);
					return group?.groupName ?? groupId;
				})
				.filter((name): name is string => name !== undefined);
			formattedGroupsText = groups.join(', ');
			// Create display text map for dropdown
			const map = new Map<string, string>();
			for (const group of availableGroups) {
				map.set(group.groupId, group.groupName);
			}
			groupDisplayTextMap = map;
			return;
		}

		// Get the ScanGroups for the group IDs
		const scanGroups = boundGroups.groupIds
			.map((groupId) => availableGroups.find((group) => group.groupId === groupId))
			.filter((group): group is ScanGroup => group !== undefined);

		if (scanGroups.length === 0) {
			formattedGroupsText = '';
			groupDisplayTextMap = new Map();
			return;
		}

		// Format with alt names
		try {
			formattedGroupsText = await GroupFormatter.formatScanGroupsWithAltNames(
				scanGroups,
				targetingState.seriesId
			);

			// Create display text map for all available groups in dropdown
			const map = new Map<string, string>();
			for (const group of availableGroups) {
				try {
					const formatted = await GroupFormatter.formatScanGroupWithAltNames(
						group,
						targetingState.seriesId
					);
					map.set(group.groupId, formatted);
				} catch (error) {
					map.set(group.groupId, group.groupName);
				}
			}
			groupDisplayTextMap = map;
		} catch (error) {
			console.warn('Failed to format groups with alt names:', error);
			// Fall back to simple formatting
			formattedGroupsText = GroupFormatter.formatScanGroups(scanGroups);
			const map = new Map<string, string>();
			for (const group of availableGroups) {
				map.set(group.groupId, group.groupName);
			}
			groupDisplayTextMap = map;
		}
	});

	function startEditing() {
		// Capture original value if tracking is enabled and field isn't already manually edited
		if (chapter && fieldName && !chapter.manuallyEditedFields.has(fieldName)) {
			// Store original value if not already stored
			if (!chapter.originalFieldValues.has(fieldName)) {
				// Store a copy of the groupIds array
				chapter.originalFieldValues.set(
					fieldName,
					boundGroups.groupIds ? [...boundGroups.groupIds] : null
				);
			}
		}

		// Capture button position before it's removed from DOM
		if (buttonRef) {
			savedButtonRect = buttonRef.getBoundingClientRect();
		}

		// Reset selectedGroups to match current boundGroups.groupIds to avoid stale selections
		// This ensures each edit session starts fresh with the current state
		// Use empty array instead of null to avoid DropdownMultiSelector's effect that converts null to []
		if (boundGroups.groupIds) {
			selectedGroups = boundGroups.groupIds
				.map((groupId) => availableGroups.find((group) => group.groupId === groupId))
				.filter((group): group is ScanGroup => group !== undefined);
		} else {
			selectedGroups = [];
		}

		isEditing = true;
		dropdownOpen = true;

		window.addEventListener('keydown', handleKeyDown);
	}

	function stopEditing() {
		isEditing = false;
		dropdownOpen = false;
		savedButtonRect = null;
		window.removeEventListener('keydown', handleKeyDown);

		boundGroups.groupIds = selectedGroups?.map((group) => group.groupId) ?? [];

		// Mark field as manually edited when user commits the edit
		if (chapter && fieldName) {
			chapter.manuallyEditedFields.add(fieldName);
		}
	}

	function handleDropdownClose() {
		stopEditing();
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			stopEditing();
		}
	}
</script>

<div>
	{#if isEditing}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div bind:this={dropdownTriggerRef} onclick={(e) => e.stopPropagation()}>
			<DropdownMultiSelector
				items={availableGroups}
				bind:selectedItems={selectedGroups}
				bind:isOpen={dropdownOpen}
				onClose={handleDropdownClose}
				buttonRect={savedButtonRect}
				getDisplayText={(group) => groupDisplayTextMap.get(group.groupId) ?? group.groupName}
			/>
		</div>
	{/if}
	<button
		bind:this={buttonRef}
		type="button"
		class="flex flex-row gap-2 bg-surface hover:bg-surface-hover cursor-pointer rounded-md px-1 border border-surface"
		onclick={(e) => {
			e.stopPropagation();
			startEditing();
		}}
		aria-label="Edit groups"
	>
		{#if boundGroups.groupIds && boundGroups.groupIds.length > 0}
			<p class="text-app">{formattedGroupsText || 'Loading...'}</p>
		{:else}
			<p class="text-muted">No group</p>
		{/if}
	</button>
</div>

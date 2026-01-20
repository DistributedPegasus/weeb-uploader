<script lang="ts">
	import type { ScanGroup } from '$lib/core/UploadingState.svelte';
	import { onMount } from 'svelte';

	interface Props {
		items: ScanGroup[];
		selectedItems: ScanGroup[] | null;
		isOpen?: boolean;
		onClose?: () => void;
		buttonRect?: DOMRect | null;
		class?: string;
		getDisplayText?: (group: ScanGroup) => string;
	}

	let {
		items,
		selectedItems = $bindable<ScanGroup[] | null>(null),
		isOpen = $bindable(true),
		onClose,
		buttonRect,
		class: className = '',
		getDisplayText
	}: Props = $props();

	function getGroupDisplayText(group: ScanGroup): string {
		return getDisplayText ? getDisplayText(group) : group.groupName;
	}

	let dropdownRef: HTMLDivElement | null = $state(null);
	let dropdownPosition = $state<{ top: number; left: number; width: number } | null>(null);

	function updatePosition() {
		// Use buttonRect (captured before button was removed)
		if (!buttonRect) {
			return;
		}

		const rect = buttonRect;
		const viewportHeight = window.innerHeight;
		const viewportWidth = window.innerWidth;
		const gap = 4;
		const maxDropdownHeight = 256; // max-h-64

		// Get actual dropdown height if available, otherwise use max
		let actualDropdownHeight = maxDropdownHeight;
		if (dropdownRef) {
			const measuredHeight = dropdownRef.getBoundingClientRect().height;
			actualDropdownHeight = Math.min(measuredHeight, maxDropdownHeight);
		}

		// Calculate available space
		const spaceBelow = viewportHeight - rect.bottom - gap;
		const spaceAbove = rect.top - gap;

		// Decide to open above or below (use maxDropdownHeight for decision, actual for positioning)
		const openAbove = spaceBelow < maxDropdownHeight && spaceAbove > spaceBelow;

		// Calculate top position
		let top: number;
		if (openAbove) {
			// Position above: dropdown bottom should be at button top - gap
			top = rect.top - actualDropdownHeight - gap;
			if (top < gap) top = gap;
		} else {
			// Position below: dropdown top should be at button bottom + gap
			top = rect.bottom + gap;
			if (top + actualDropdownHeight > viewportHeight) {
				top = Math.max(gap, viewportHeight - actualDropdownHeight - gap);
			}
		}

		// Calculate left position
		let left = rect.left;
		const minWidth = 256;
		if (left + minWidth > viewportWidth) {
			left = viewportWidth - minWidth - gap;
			if (left < gap) left = gap;
		}

		dropdownPosition = {
			top,
			left,
			width: Math.max(rect.width, minWidth)
		};
	}

	// Initialize selectedItems if null
	$effect(() => {
		if (selectedItems === null) {
			selectedItems = [];
		}
	});

	function toggleItem(group: ScanGroup) {
		if (selectedItems === null) {
			selectedItems = [];
		}
		const index = selectedItems.findIndex((item) => item.groupId === group.groupId);
		if (index >= 0) {
			selectedItems = selectedItems.filter((item) => item.groupId !== group.groupId);
		} else {
			selectedItems = [...selectedItems, group];
		}
	}

	function isSelected(group: ScanGroup): boolean {
		if (selectedItems === null) {
			return false;
		}
		return selectedItems.some((item) => item.groupId === group.groupId);
	}

	function clearSelection() {
		selectedItems = [];
	}

	$effect(() => {
		if (isOpen) {
			// Only proceed if we have buttonRect to calculate position
			if (!buttonRect) {
				dropdownPosition = null;
				return;
			}

			// Update position when opening - need to wait for dropdown to render first
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					updatePosition();
				});
			});

			const handleResize = () => updatePosition();

			const handleClickOutside = (event: MouseEvent) => {
				const target = event.target as HTMLElement;
				if (dropdownRef && !dropdownRef.contains(target)) {
					// Close dropdown and notify parent
					isOpen = false;
					onClose?.();
				}
			};

			const timeoutId = setTimeout(() => {
				window.addEventListener('resize', handleResize);
				document.addEventListener('click', handleClickOutside, true);
			}, 10);

			return () => {
				clearTimeout(timeoutId);
				window.removeEventListener('resize', handleResize);
				document.removeEventListener('click', handleClickOutside, true);
			};
		} else {
			dropdownPosition = null;
		}
	});

	// Update position once dropdownRef is available to get actual height
	// Only run when dropdownRef changes from null to available
	let hasUpdatedWithActualHeight = $state(false);
	$effect(() => {
		if (isOpen && dropdownRef && !hasUpdatedWithActualHeight) {
			hasUpdatedWithActualHeight = true;
			// Use requestAnimationFrame to ensure the dropdown is fully rendered
			requestAnimationFrame(() => {
				updatePosition();
			});
		}
		if (!isOpen) {
			hasUpdatedWithActualHeight = false;
		}
	});
</script>

{#if isOpen && dropdownPosition}
	<div
		bind:this={dropdownRef}
		class={[
			'fixed z-[9999] bg-surface border border-surface rounded-md shadow-lg max-h-64 overflow-y-auto min-w-64 text-app',
			className
		]}
		style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px; width: {dropdownPosition.width}px;"
		onclick={(e) => e.stopPropagation()}
		role="presentation"
	>
		<div class="p-2 space-y-1">
			<!-- Clear Selection Option -->
			<button
				type="button"
				onclick={() => clearSelection()}
				class="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors flex items-center gap-2 {selectedItems ===
					null || selectedItems.length === 0
					? 'bg-red-50 dark:bg-red-900/30 font-medium'
					: ''}"
			>
				<span>Clear Selection</span>
			</button>

			{#if items.length > 0}
				<div class="border-t border-muted my-1"></div>
			{/if}

			<!-- Group Options -->
			{#each items as group}
				<label
					class="flex items-center gap-2 px-3 py-2 text-sm text-app hover:bg-surface-hover rounded cursor-pointer transition-colors {isSelected(
						group
					)
						? 'bg-blue-50 dark:bg-blue-900/20'
						: ''}"
				>
					<input
						type="checkbox"
						checked={isSelected(group)}
						onchange={() => toggleItem(group)}
						class="w-4 h-4 text-blue-600 dark:text-blue-400 border-surface rounded focus:ring-blue-500"
					/>
					<span class="flex-1 text-app">{getGroupDisplayText(group)}</span>
				</label>
			{/each}

			{#if items.length === 0}
				<div class="px-3 py-2 text-sm text-muted">No items available</div>
			{/if}
		</div>
	</div>
{/if}

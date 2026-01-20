<script lang="ts">
	import type { SelectedFolder } from '$lib/core/GroupedFolders';
	import type { VerticalSliceSelection } from '$lib/components/VerticalSlicerComponents/VerticalSliceTypes.svelte';
	import SliceDirectorySelector from './SliceDirectorySelector.svelte';

	interface Props {
		slicedFolders: SelectedFolder[];
		class?: string;
		selectedSlicedFolders: VerticalSliceSelection[];
	}

	let {
		slicedFolders,
		class: className = '',
		selectedSlicedFolders = $bindable<VerticalSliceSelection[]>([])
	}: Props = $props();

	$effect(() => {
		selectedSlicedFolders = slicedFolders.map((folder) => ({
			folder,
			isSelected: true
		}));
	});
</script>

<div class={['grid grid-cols-2 gap-2', className]}>
	{#each selectedSlicedFolders as folder, index}
		<SliceDirectorySelector bind:selectedSlicedFolder={selectedSlicedFolders[index]} />
	{/each}
</div>

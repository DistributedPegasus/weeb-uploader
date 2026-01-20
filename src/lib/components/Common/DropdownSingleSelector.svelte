<script lang="ts">
	interface Props {
		items: string[];
		selectedItem: string | null;
		class?: string;
		id?: string;
		getDisplayText?: (item: string) => string;
	}

	let {
		items,
		selectedItem = $bindable<string | null>(null),
		class: className = '',
		id,
		getDisplayText
	}: Props = $props();

	function getItemDisplayText(item: string): string {
		return getDisplayText ? getDisplayText(item) : item;
	}
</script>

<select
	bind:value={selectedItem}
	{id}
	class={['input-base cursor-pointer hover:bg-surface-hover', className]}
>
	{#each items as item}
		<option value={item}>{getItemDisplayText(item)}</option>
	{/each}
</select>

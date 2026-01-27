<script lang="ts">
	import { onMount } from 'svelte';
	import { setContext } from 'svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { GlobalState, globalStateContext } from '$lib/core/GlobalState.svelte';
	import { getThemeStore } from '$lib/core/theme.svelte';
	import OfficialCopyWarning from '$lib/components/Common/OfficialCopyWarning.svelte';

	let { children } = $props();

	// Create and provide global state
	const globalState = new GlobalState();
	setContext(globalStateContext, globalState);

	// Initialize theme store on mount to ensure dark class is applied
	onMount(() => {
		getThemeStore();
	});
</script>

<svelte:head>
	<title>Weeb Uploader</title>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="bg-app text-app min-h-screen">
	<OfficialCopyWarning />
	{@render children()}
</div>

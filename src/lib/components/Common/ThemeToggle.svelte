<script lang="ts">
	import { getThemeStore } from '$lib/core/theme.svelte';

	const themeStore = getThemeStore();
	let effectiveTheme = $state(themeStore.effectiveTheme);

	// Reactively update when theme mode changes
	$effect(() => {
		// Access themeMode to create a dependency
		const _ = themeStore.themeMode;
		effectiveTheme = themeStore.effectiveTheme;
	});

	function handleToggle() {
		themeStore.toggleTheme();
	}
</script>

<button
	type="button"
	onclick={handleToggle}
	class="btn-ghost"
	aria-label={effectiveTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
	title={effectiveTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
>
	{#if effectiveTheme === 'dark'}
		<div class="i-mdi-weather-sunny h-5 w-5 text-app"></div>
	{:else}
		<div class="i-mdi-weather-night h-5 w-5 text-app"></div>
	{/if}
</button>

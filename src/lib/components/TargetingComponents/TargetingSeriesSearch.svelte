<script lang="ts">
	import { getContext } from 'svelte';
	import {
		searchManga,
		TargetingState,
		targetingStateContext,
		type MangaData
	} from './TargetingState.svelte';

	const targetingState = getContext<TargetingState>(targetingStateContext);
	if (!targetingState) {
		throw new Error(
			'TargetingSeriesSearch must be used within a component that provides TargetingState context'
		);
	}

	let searchQuery = $state('');
	let searchResults = $state<MangaData[]>([]);
	let isSearching = $state(false);

	async function searchMangaClick() {
		if (!searchQuery.trim() || searchQuery.trim().length <= 2 || isSearching) {
			return;
		}

		isSearching = true;
		try {
			const response = await searchManga(searchQuery.trim());
			searchResults = response.data;
		} catch (error) {
			console.error(error);
		} finally {
			isSearching = false;
		}
	}

	function selectSeries(id: string, title: string) {
		targetingState.seriesId = id;
		searchResults = [];
		searchQuery = '';
	}

	function getCoverUrl(result: MangaData): string | null {
		if (!result.relationships?.cover?.id || !result.id) {
			return null;
		}
		return `https://weebdex.org/covers/${result.id}/${result.relationships.cover.id}.256.webp`;
	}
</script>

<div class="flex flex-col gap-2 bg-surface rounded-md p-4">
	<form
		class="flex flex-col gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			searchMangaClick();
		}}
	>
		<div class="flex flex-row gap-2 items-center grow-1">
			<label for="search-query-input" class="text-sm font-medium text-app"
				>Search for a series:</label
			>
			<input
				class="input-base grow-1"
				id="search-query-input"
				type="text"
				bind:value={searchQuery}
				placeholder="Search for a series"
			/>
		</div>
		<button class="clickable-hint p-2 rounded-md" type="submit"> Search </button>
	</form>

	<div class="grid grid-cols-2 gap-3">
		{#if isSearching}
			<p class="text-app">Searching...</p>
		{:else}
			{#each searchResults as result}
				<button
					class="flex flex-row gap-4 clickable-hint rounded-md p-4 border border-surface bg-surface hover:bg-surface-hover text-left"
					onclick={() => selectSeries(result.id, result.title)}
				>
					{#if getCoverUrl(result)}
						<img
							src={getCoverUrl(result)}
							alt={result.title || 'Cover'}
							class="w-24 h-32 rounded object-cover shadow-md flex-shrink-0"
						/>
					{:else}
						<div
							class="w-24 h-32 rounded bg-surface-hover flex-shrink-0 flex items-center justify-center"
						>
							<div class="i-mdi-image-off h-8 w-8 text-muted"></div>
						</div>
					{/if}
					<div class="flex-1 min-w-0 flex flex-col gap-2">
						<div class="flex flex-row items-start justify-between gap-2">
							<div class="flex-1 min-w-0">
								<h3 class="text-lg font-bold text-app truncate">{result.title}</h3>
								<p class="text-xs text-muted mt-1">ID: {result.id}</p>
							</div>
							<div
								class="i-mdi-plus h-6 w-6 text-green-500 dark:text-green-400 flex-shrink-0"
								aria-label="Select series"
								title="Select series"
							></div>
						</div>
						{#if result.description}
							<p class="text-sm text-app line-clamp-3">{result.description}</p>
						{:else}
							<p class="text-sm text-muted italic">No description available</p>
						{/if}
					</div>
				</button>
			{/each}
		{/if}
	</div>
</div>

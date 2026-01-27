<script lang="ts">
	import { onMount } from 'svelte';

	const STORAGE_KEY = 'weebdex_confirmed_no_official_copies';
	const TIMER_DURATION = 5; // seconds

	let isConfirmed = $state(false);
	let showModal = $state(false);
	let timeRemaining = $state(TIMER_DURATION);

	onMount(() => {
		if (typeof window !== 'undefined') {
			const stored = localStorage.getItem(STORAGE_KEY);
			isConfirmed = stored === 'true';
			showModal = !isConfirmed;
		}
	});

	// Start timer when modal shows
	$effect(() => {
		if (showModal) {
			timeRemaining = TIMER_DURATION;
			const interval = setInterval(() => {
				timeRemaining--;
				if (timeRemaining <= 0) {
					clearInterval(interval);
				}
			}, 1000);

			return () => clearInterval(interval);
		}
	});

	function confirm() {
		if (typeof window !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, 'true');
			isConfirmed = true;
			showModal = false;
		}
	}
</script>

{#if showModal}
	<!-- Modal Overlay -->
	<div
		class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="warning-title"
	>
		<!-- Modal Content -->
		<div
			class="bg-surface border border-surface rounded-lg shadow-xl max-w-lg w-full mx-4 p-6 flex flex-col gap-4"
		>
			<h2 id="warning-title" class="text-2xl font-bold text-app">Usage Notice</h2>

			<div class="flex flex-col gap-3 text-app">
				<p>
					<strong>
						Please confirm that you will not use this project to upload official copies of licensed
						content.
					</strong>
				</p>
			</div>

			<div class="flex flex-row gap-3 justify-end mt-2">
				<button
					type="button"
					disabled={timeRemaining > 0}
					class="clickable-hint px-6 py-2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-400 dark:hover:bg-blue-500 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					onclick={confirm}
				>
					{timeRemaining > 0 ? `I Confirm (${timeRemaining}s)` : 'I Confirm'}
				</button>
			</div>
		</div>
	</div>
{/if}

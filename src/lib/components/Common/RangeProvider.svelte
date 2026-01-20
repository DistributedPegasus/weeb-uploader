<script lang="ts">
	interface Props {
		rangeStart: number | null;
		rangeEnd: number | null;
		min: number;
		max: number;
	}

	let {
		rangeStart = $bindable<number | null>(null),
		rangeEnd = $bindable<number | null>(null),
		min,
		max
	}: Props = $props();

	// Track committed values for min/max calculation
	let committedStart = $state(rangeStart);
	let committedEnd = $state(rangeEnd);

	// Local editing values
	let editingStart = $state(rangeStart);
	let editingEnd = $state(rangeEnd);

	// Update committed values on blur
	function handleStartBlur() {
		committedStart = editingStart;
		rangeStart = editingStart;
		// Ensure rangeEnd is never less than rangeStart
		if (rangeStart !== null && rangeEnd !== null && rangeEnd < rangeStart) {
			rangeEnd = rangeStart;
			committedEnd = rangeStart;
			editingEnd = rangeStart;
		}
	}

	function handleEndBlur() {
		committedEnd = editingEnd;
		rangeEnd = editingEnd;
		// Ensure rangeEnd is never less than rangeStart
		if (rangeStart !== null && rangeEnd !== null && rangeEnd < rangeStart) {
			rangeEnd = rangeStart;
			committedEnd = rangeStart;
			editingEnd = rangeStart;
		}
	}

	// Sync local values when props change externally
	$effect(() => {
		editingStart = rangeStart;
		committedStart = rangeStart;
	});

	$effect(() => {
		editingEnd = rangeEnd;
		committedEnd = rangeEnd;
	});
</script>

<div class="flex flex-row gap-2 items-center text-app">
	<p>Range:</p>
	<input
		type="number"
		bind:value={editingStart}
		onblur={handleStartBlur}
		placeholder="Start"
		{min}
		max={committedEnd !== null ? Math.min(max, committedEnd) : max}
		class="input-base grow-1 min-w-10"
	/>
	<p>to</p>
	<input
		type="number"
		bind:value={editingEnd}
		onblur={handleEndBlur}
		placeholder="End"
		min={committedStart !== null ? Math.max(min, committedStart) : min}
		{max}
		class="input-base grow-1 min-w-10"
	/>
</div>

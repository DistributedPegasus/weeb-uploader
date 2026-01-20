<script lang="ts">
	interface Props {
		class?: string;
		title?: string;
		position?: 'bottom' | 'top' | 'left' | 'right';
		children?: import('svelte').Snippet;
	}

	let {
		class: className = '',
		title = 'Click for more information',
		position = 'bottom',
		children
	}: Props = $props();

	let isExpanded = $state(false);
	let containerElement = $state<HTMLDivElement | undefined>(undefined);
	let tooltipElement = $state<HTMLDivElement | undefined>(undefined);
	let computedPosition = $state<{
		side: 'bottom' | 'top' | 'left' | 'right';
		offsetX: number;
		offsetY: number;
	}>({ side: position, offsetX: 0, offsetY: 0 });

	function toggle() {
		isExpanded = !isExpanded;
		if (isExpanded) {
			// Initialize with preferred position
			computedPosition = { side: position, offsetX: 0, offsetY: 0 };
			// Calculate position after DOM is updated
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					calculatePosition();
				});
			});
		}
	}

	function handleClickOutside(event: MouseEvent) {
		if (containerElement && !containerElement.contains(event.target as Node)) {
			isExpanded = false;
		}
	}

	function calculatePosition() {
		if (!containerElement || !tooltipElement) {
			return;
		}

		const buttonRect = containerElement.getBoundingClientRect();
		const tooltipRect = tooltipElement.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const spacing = 8; // 8px spacing (mt-2 = 0.5rem = 8px)

		// Calculate space available in each direction
		const spaceBottom = viewportHeight - buttonRect.bottom - spacing;
		const spaceTop = buttonRect.top - spacing;
		const spaceRight = viewportWidth - buttonRect.right - spacing;
		const spaceLeft = buttonRect.left - spacing;

		// Determine best position based on available space
		let bestSide = position;
		let offsetX = 0;
		let offsetY = 0;

		// Check if preferred position fits
		const preferredFits =
			(position === 'bottom' && spaceBottom >= tooltipRect.height) ||
			(position === 'top' && spaceTop >= tooltipRect.height) ||
			(position === 'right' && spaceRight >= tooltipRect.width) ||
			(position === 'left' && spaceLeft >= tooltipRect.width);

		if (!preferredFits) {
			// Preferred position doesn't fit, find the best alternative
			const spaces = [
				{ side: 'bottom' as const, space: spaceBottom, fits: spaceBottom >= tooltipRect.height },
				{ side: 'top' as const, space: spaceTop, fits: spaceTop >= tooltipRect.height },
				{ side: 'right' as const, space: spaceRight, fits: spaceRight >= tooltipRect.width },
				{ side: 'left' as const, space: spaceLeft, fits: spaceLeft >= tooltipRect.width }
			];

			// Find the side that fits and has the most space
			const fittingSides = spaces.filter((s) => s.fits);
			if (fittingSides.length > 0) {
				bestSide = fittingSides.reduce((best, current) =>
					current.space > best.space ? current : best
				).side;
			} else {
				// None fit, use the one with the most space
				bestSide = spaces.reduce((best, current) =>
					current.space > best.space ? current : best
				).side;
			}
		}

		// Calculate horizontal offset to keep tooltip within viewport (for top/bottom positions)
		if (bestSide === 'bottom' || bestSide === 'top') {
			const tooltipWidth = tooltipRect.width;
			const buttonCenterX = buttonRect.left + buttonRect.width / 2;
			const tooltipLeftViewport = buttonCenterX - tooltipWidth / 2;
			const containerLeft = containerElement.getBoundingClientRect().left;
			const buttonCenterRelative = buttonRect.left - containerLeft + buttonRect.width / 2;

			// Calculate desired left position relative to container (centered on button)
			let desiredLeftRelative = buttonCenterRelative - tooltipWidth / 2;

			// Adjust if tooltip would overflow left edge of viewport
			if (tooltipLeftViewport < spacing) {
				desiredLeftRelative += spacing - tooltipLeftViewport;
			}
			// Adjust if tooltip would overflow right edge of viewport
			else if (tooltipLeftViewport + tooltipWidth > viewportWidth - spacing) {
				desiredLeftRelative -= tooltipLeftViewport + tooltipWidth - (viewportWidth - spacing);
			}

			offsetX = desiredLeftRelative;
		}

		// Calculate vertical offset to keep tooltip within viewport (for left/right positions)
		if (bestSide === 'left' || bestSide === 'right') {
			const tooltipHeight = tooltipRect.height;
			const buttonCenterY = buttonRect.top + buttonRect.height / 2;
			const tooltipTopViewport = buttonCenterY - tooltipHeight / 2;
			const containerTop = containerElement.getBoundingClientRect().top;
			const buttonCenterRelative = buttonRect.top - containerTop + buttonRect.height / 2;

			// Calculate desired top position relative to container (centered on button)
			let desiredTopRelative = buttonCenterRelative - tooltipHeight / 2;

			// Adjust if tooltip would overflow top edge of viewport
			if (tooltipTopViewport < spacing) {
				desiredTopRelative += spacing - tooltipTopViewport;
			}
			// Adjust if tooltip would overflow bottom edge of viewport
			else if (tooltipTopViewport + tooltipHeight > viewportHeight - spacing) {
				desiredTopRelative -= tooltipTopViewport + tooltipHeight - (viewportHeight - spacing);
			}

			offsetY = desiredTopRelative;
		}

		computedPosition = { side: bestSide, offsetX, offsetY };
	}

	$effect(() => {
		if (isExpanded) {
			document.addEventListener('click', handleClickOutside);
			window.addEventListener('resize', calculatePosition);
			window.addEventListener('scroll', calculatePosition, true);
			return () => {
				document.removeEventListener('click', handleClickOutside);
				window.removeEventListener('resize', calculatePosition);
				window.removeEventListener('scroll', calculatePosition, true);
			};
		}
	});

	function getPositionClasses(): string {
		switch (computedPosition.side) {
			case 'top':
				return 'bottom-full mb-2';
			case 'left':
				return 'right-full mr-2';
			case 'right':
				return 'left-full ml-2';
			case 'bottom':
			default:
				return 'top-full mt-2';
		}
	}

	function getPositionStyle(): string {
		let style = '';
		if (computedPosition.side === 'bottom' || computedPosition.side === 'top') {
			// For vertical positions, position horizontally
			style += `left: ${computedPosition.offsetX}px;`;
		} else {
			// For horizontal positions, position vertically
			style += `top: ${computedPosition.offsetY}px;`;
		}
		return style;
	}
</script>

<div class="relative inline-block {className}" bind:this={containerElement}>
	<button
		type="button"
		onclick={toggle}
		class="btn-ghost p-1 rounded-full transition-colors"
		aria-label={title}
		aria-expanded={isExpanded}
		{title}
	>
		<div class="i-mdi-help-circle h-5 w-5 text-app"></div>
	</button>

	{#if isExpanded}
		<div
			bind:this={tooltipElement}
			class="absolute z-50 {getPositionClasses()} p-3 bg-surface border border-surface rounded-md shadow-lg min-w-64 max-w-md transition-opacity duration-200"
			style={getPositionStyle()}
			role="tooltip"
		>
			<div class="text-app text-sm">
				{#if children}
					{@render children()}
				{/if}
			</div>
		</div>
	{/if}
</div>

<script lang="ts">
	import type { Snippet } from "svelte";

	interface Props<T> {
		items: T[];
		itemHeight: number;
		containerHeight?: number;
		overscan?: number;
		children: Snippet<[{ item: T; index: number }]>;
	}

	let {
		items,
		itemHeight,
		containerHeight = 400,
		overscan = 5,
		children,
	}: Props<unknown> = $props();

	let scrollTop = $state(0);
	let containerRef = $state<HTMLDivElement | null>(null);

	// Calculate total scrollable height
	let totalHeight = $derived(items.length * itemHeight);

	// Calculate visible range
	let startIndex = $derived(Math.max(0, Math.floor(scrollTop / itemHeight) - overscan));
	let endIndex = $derived(
		Math.min(items.length, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan)
	);

	// Get visible items
	let visibleItems = $derived(
		items.slice(startIndex, endIndex).map((item, i) => ({
			item,
			index: startIndex + i,
		}))
	);

	// Calculate offset for positioning
	let offsetY = $derived(startIndex * itemHeight);

	function handleScroll(event: Event) {
		const target = event.target as HTMLDivElement;
		scrollTop = target.scrollTop;
	}
</script>

<div
	bind:this={containerRef}
	class="virtual-scroll-container overflow-auto"
	style="height: {containerHeight}px;"
	onscroll={handleScroll}
>
	<div style="height: {totalHeight}px; position: relative;">
		<div style="transform: translateY({offsetY}px);">
			{#each visibleItems as { item, index } (index)}
				<div style="height: {itemHeight}px;">
					{@render children({ item, index })}
				</div>
			{/each}
		</div>
	</div>
</div>

<script lang="ts">
	import { fade } from "svelte/transition";
	import IconChevron from "./icons/IconChevron.svelte";

	interface Props {
		scrollNode: HTMLElement;
		class?: string;
	}

	let { scrollNode, class: className = "" }: Props = $props();

	let visible = $state(false);

	function updateVisibility() {
		if (!scrollNode) return;
		visible =
			Math.ceil(scrollNode.scrollTop) + 200 < scrollNode.scrollHeight - scrollNode.clientHeight;
	}

	$effect(() => {
		if (!scrollNode) return;

		updateVisibility();

		const handleScroll = () => updateVisibility();
		scrollNode.addEventListener("scroll", handleScroll);

		let observer: ResizeObserver | null = null;
		if (typeof ResizeObserver !== "undefined") {
			observer = new ResizeObserver(() => updateVisibility());
			observer.observe(scrollNode);
		}

		return () => {
			observer?.disconnect();
			scrollNode.removeEventListener("scroll", handleScroll);
		};
	});
</script>

{#if visible}
	<button
		transition:fade={{ duration: 150 }}
		onclick={() => scrollNode.scrollTo({ top: scrollNode.scrollHeight, behavior: "smooth" })}
		class="btn absolute flex h-[41px] w-[41px] rounded-full border bg-white shadow-md transition-all hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:shadow-gray-950 dark:hover:bg-gray-600 {className}"
		><IconChevron classNames="mt-[2px]" /></button
	>
{/if}

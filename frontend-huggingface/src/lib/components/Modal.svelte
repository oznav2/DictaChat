<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { cubicOut, backOut } from "svelte/easing";
	import { fade, fly, scale } from "svelte/transition";
	import Portal from "./Portal.svelte";
	import { browser } from "$app/environment";
	import CarbonClose from "~icons/carbon/close";

	interface Props {
		width?: string;
		closeButton?: boolean;
		disableFly?: boolean;
		/** When false, clicking backdrop will not close the modal */
		closeOnBackdrop?: boolean;
		onclose?: () => void;
		children?: import("svelte").Snippet;
		dir?: "ltr" | "rtl";
	}

	let {
		width = "max-w-sm",
		children,
		closeButton = false,
		disableFly = false,
		closeOnBackdrop = true,
		onclose,
		dir = "ltr",
	}: Props = $props();
	
	// Respect user's motion preferences
	const prefersReducedMotion = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	let backdropEl: HTMLDivElement | undefined = $state();
	let modalEl: HTMLDivElement | undefined = $state();

	function handleKeydown(event: KeyboardEvent) {
		// close on ESC
		if (event.key === "Escape") {
			event.preventDefault();
			onclose?.();
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		if (window?.getSelection()?.toString()) {
			return;
		}
		if (event.target === backdropEl && closeOnBackdrop) {
			onclose?.();
		}
	}

	onMount(() => {
		document.getElementById("app")?.setAttribute("inert", "true");
		modalEl?.focus();
		// Ensure Escape closes even if focus isn't within modal
		window.addEventListener("keydown", handleKeydown, { capture: true });
	});

	onDestroy(() => {
		if (!browser) return;
		document.getElementById("app")?.removeAttribute("inert");
		window.removeEventListener("keydown", handleKeydown, { capture: true });
	});
</script>

<Portal>
	<div
		role="presentation"
		tabindex="-1"
		bind:this={backdropEl}
		onclick={(e) => {
			e.stopPropagation();
			handleBackdropClick(e);
		}}
		in:fade={{ duration: prefersReducedMotion ? 0 : 200, easing: cubicOut }}
		out:fade={{ duration: prefersReducedMotion ? 0 : 150, easing: cubicOut }}
		class="modal-backdrop fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm dark:bg-black/60"
	>
		{#if disableFly}
			<div
				role="dialog"
				tabindex="-1"
				bind:this={modalEl}
				onkeydown={handleKeydown}
				in:scale={{ duration: prefersReducedMotion ? 0 : 250, start: 0.95, easing: backOut }}
				out:scale={{ duration: prefersReducedMotion ? 0 : 150, start: 0.95, easing: cubicOut }}
				class={[
					"modal-content scrollbar-custom relative mx-auto max-h-[95dvh] max-w-[90dvw] overflow-y-auto overflow-x-hidden rounded-2xl bg-white shadow-2xl outline-none transition-shadow duration-300 dark:bg-gray-800 dark:text-gray-200",
					width,
				]}
			>
				{#if closeButton}
					<button
						class="modal-close-btn absolute top-4 z-50 rounded-full p-1 transition-all duration-200 hover:bg-gray-100 active:scale-95 dark:hover:bg-gray-700 {dir === 'rtl' ? 'left-4' : 'right-4'}"
						onclick={() => onclose?.()}
						aria-label="Close modal"
					>
						<CarbonClose class="size-5 text-gray-600 transition-colors dark:text-gray-400" />
					</button>
				{/if}
				{@render children?.()}
			</div>
		{:else}
			<div
				role="dialog"
				tabindex="-1"
				bind:this={modalEl}
				onkeydown={handleKeydown}
				in:fly={{ y: prefersReducedMotion ? 0 : 30, duration: prefersReducedMotion ? 0 : 300, easing: backOut }}
				out:fly={{ y: prefersReducedMotion ? 0 : 20, duration: prefersReducedMotion ? 0 : 200, easing: cubicOut }}
				class={[
					"modal-content scrollbar-custom relative mx-auto max-h-[95dvh] max-w-[90dvw] overflow-y-auto overflow-x-hidden rounded-2xl bg-white shadow-2xl outline-none transition-shadow duration-300 dark:bg-gray-800 dark:text-gray-200",
					width,
				]}
			>
				{#if closeButton}
					<button
						class="modal-close-btn absolute top-4 z-50 rounded-full p-1 transition-all duration-200 hover:bg-gray-100 active:scale-95 dark:hover:bg-gray-700 {dir === 'rtl' ? 'left-4' : 'right-4'}"
						onclick={() => onclose?.()}
						aria-label="Close modal"
					>
						<CarbonClose class="size-5 text-gray-600 transition-colors dark:text-gray-400" />
					</button>
				{/if}
				{@render children?.()}
			</div>
		{/if}
	</div>
</Portal>

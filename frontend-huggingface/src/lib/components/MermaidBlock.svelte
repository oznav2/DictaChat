<script lang="ts">
	import mermaid from "mermaid";
	import { onMount } from "svelte";
	import { browser } from "$app/environment";
	import { nanoid } from "nanoid";
	import CopyToClipBoardBtn from "./CopyToClipBoardBtn.svelte";

	interface Props {
		code: string;
	}

	let { code }: Props = $props();
	let container: HTMLElement | undefined = $state();
	let error: string | null = $state(null);
	let renderedSvg = $state("");

	// Initialize mermaid with appropriate theme
	// We'll let the user/system preference drive the theme if possible, 
	// or default to 'default' (light) / 'dark' based on document class
	onMount(async () => {
		if (browser) {
			const isDark = document.documentElement.classList.contains("dark");
			mermaid.initialize({
				startOnLoad: false,
				theme: isDark ? "dark" : "default",
				securityLevel: "loose", // needed for click events/html in nodes if used
			});
			await renderDiagram();
		}
	});

	$effect(() => {
		if (code && browser) {
			renderDiagram();
		}
	});

	async function renderDiagram() {
		if (!container) return;
		error = null;
		
		try {
			// Generate a unique ID for the diagram
			const id = `mermaid-${nanoid()}`;
			
			// Clean code: unescape HTML entities if any
			const cleanCode = code
				.replace(/&gt;/g, ">")
				.replace(/&lt;/g, "<")
				.replace(/&amp;/g, "&")
				.trim();

			// Parse first to check validity if possible, but render handles it
			const { svg } = await mermaid.render(id, cleanCode);
			renderedSvg = svg;
		} catch (e) {
			console.error("Mermaid rendering failed:", e);
			error = "Failed to render diagram";
			// Mermaid leaves an error element in the DOM sometimes, or throws
		}
	}
</script>

<div class="my-4 overflow-x-auto rounded-lg bg-white p-4 dark:bg-gray-900 relative group" bind:this={container}>
	{#if renderedSvg}
		<div class="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
			<CopyToClipBoardBtn
				iconClassNames="size-3.5"
				classNames="btn transition-none rounded-lg border size-7 text-sm shadow-sm bg-white/50 backdrop-blur hover:bg-white active:shadow-inner border-gray-200 hover:border-gray-300 dark:bg-gray-800/50 dark:hover:bg-gray-800 dark:border-gray-700 dark:hover:border-gray-600"
				value={code}
			/>
		</div>
	{/if}
	{#if error}
		<div class="text-sm text-red-500">
			{error}
			<pre class="mt-2 text-xs text-gray-500">{code}</pre>
		</div>
	{:else if renderedSvg}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html renderedSvg}
	{:else}
		<div class="animate-pulse text-sm text-gray-500">Rendering diagram...</div>
	{/if}
</div>

<script lang="ts">
	import type { Token } from "$lib/utils/marked";
	import CodeBlock from "../CodeBlock.svelte";
	import MermaidBlock from "../MermaidBlock.svelte";

	interface Props {
		tokens: Token[];
		loading?: boolean;
	}

	let { tokens, loading = false }: Props = $props();

	// Derive rendered tokens for memoization
	const renderedTokens = $derived(tokens);
</script>

{#each renderedTokens as token}
	{#if token.type === "text"}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html token.html}
	{:else if token.type === "code"}
		{#if token.lang === "mermaid"}
			<MermaidBlock code={token.code} />
		{:else}
			<CodeBlock
				code={token.code}
				rawCode={token.rawCode}
				lang={token.lang}
				loading={loading && !token.isClosed}
			/>
		{/if}
	{/if}
{/each}

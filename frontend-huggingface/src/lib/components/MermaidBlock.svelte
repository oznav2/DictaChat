<script lang="ts">
	import { onMount } from "svelte";
	import { browser } from "$app/environment";
	import CopyToClipBoardBtn from "./CopyToClipBoardBtn.svelte";

	interface Props {
		code: string;
	}

	let { code }: Props = $props();
	let container: HTMLElement | undefined = $state();
	let error: string | null = $state(null);
	let renderedSvg = $state("");
	type MermaidApi = typeof import("mermaid").default;
	let mermaid = $state<MermaidApi | null>(null);

	// Initialize mermaid with appropriate theme
	// We'll let the user/system preference drive the theme if possible,
	// or default to 'default' (light) / 'dark' based on document class
	onMount(async () => {
		if (browser) {
			try {
				const mermaidModule = await import("mermaid");
				const m = (mermaidModule.default ?? mermaidModule) as unknown as MermaidApi;

				const isDark = document.documentElement.classList.contains("dark");
				m.initialize({
					startOnLoad: false,
					theme: isDark ? "dark" : "default",
					securityLevel: "loose",
					flowchart: { useMaxWidth: false, htmlLabels: true },
				});
				mermaid = m;
			} catch (e) {
				console.error("MermaidBlock: Failed to load mermaid", e);
				error = "Failed to load diagram engine: " + (e instanceof Error ? e.message : String(e));
			}
		}
	});

	$effect(() => {
		if (code && browser && mermaid) {
			renderDiagram();
		}
	});

	async function renderDiagram() {
		if (!container || !mermaid) {
			return;
		}
		error = null;

		try {
			// Generate a unique ID for the diagram
			const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;

			// Clean code: unescape HTML entities if any
			const cleanCode = code
				.replace(/&gt;/g, ">")
				.replace(/&lt;/g, "<")
				.replace(/&amp;/g, "&")
				.trim();

			// Validate with parse() first to catch errors that render() might swallow (returning error SVG)
			let validCode = cleanCode;
			try {
				await mermaid.parse(cleanCode);
			} catch (parseError) {
				console.warn("Mermaid parse failed, attempting auto-fix:", parseError);
				try {
					const fixedCode = fixMermaidCode(cleanCode);
					// Validate the fixed code
					await mermaid.parse(fixedCode);
					validCode = fixedCode;
					console.log("Auto-fix successful");
				} catch (fixError) {
					console.error("Auto-fix failed:", fixError);
					// If auto-fix fails, we show the error message instead of the broken diagram
					error =
						"Failed to render diagram (syntax error): " +
						(fixError instanceof Error ? fixError.message : String(fixError));
					return;
				}
			}

			// Add timeout
			const renderPromise = mermaid.render(id, validCode);
			const timeoutPromise = new Promise((_, reject) =>
				setTimeout(() => reject(new Error("Render timeout")), 5000)
			);

			// Parse first to check validity if possible, but render handles it
			const result = (await Promise.race([renderPromise, timeoutPromise])) as { svg: string };
			const { svg } = result;

			renderedSvg = svg;
		} catch (e) {
			console.error("Mermaid rendering failed:", e);
			error = "Failed to render diagram: " + (e instanceof Error ? e.message : String(e));
		}
	}

	function fixMermaidCode(code: string): string {
		const sanitize = (text: string) => {
			let content = text.trim();
			if (content.length >= 2 && content.startsWith('"') && content.endsWith('"')) {
				content = content.slice(1, -1);
			}
			content = content.replace(/"/g, "'");
			content = content.replace(/\n/g, "<br/>");
			return `"${content}"`;
		};

		// Order: Longest delimiters first!
		// 1. Strings
		// 2. {{...}}
		// 3. [[...]]
		// 4. ((...))
		// 5. >]... ]
		// 6. [...]
		// 7. (...)
		// 8. {...}
		// 9. |...| (Arrow labels)

		const pattern =
			/("[^"]*")|([^\s\x5B(){}]+)(\s*)\{\{(.*?)\}\}|([^\s\x5B(){}]+)(\s*)\[\[(.*?)\]\]|([^\s\x5B(){}]+)(\s*)\(\((.*?)\)\)|([^\s\x5B(){}]+)(\s*)>\](.*?)\]|([^\s\x5B(){}]+)(\s*)\[(.*?)\]|([^\s\x5B(){}]+)(\s*)\((.*?)\)|([^\s\x5B(){}]+)(\s*)\{(.*?)\}|(\|)([^|]+)(\|)/gs;

		return code.replace(
			pattern,
			(
				match,
				str,
				hexId,
				hexSp,
				hexContent,
				subId,
				subSp,
				subContent,
				dcId,
				dcSp,
				dcContent,
				asId,
				asSp,
				asContent,
				sqId,
				sqSp,
				sqContent,
				rdId,
				rdSp,
				rdContent,
				cuId,
				cuSp,
				cuContent,
				pipeOpen,
				pipeContent,
				pipeClose
			) => {
				if (str) return str;

				if (pipeContent !== undefined) {
					return `${pipeOpen}${sanitize(pipeContent)}${pipeClose}`;
				}

				const process = (id: string, sp: string, content: string, open: string, close: string) => {
					if (id.match(/^(linkStyle|classDef|style|click)$/i)) return match;
					return `${id}${sp}${open}${sanitize(content)}${close}`;
				};

				if (hexId) return process(hexId, hexSp, hexContent, "{{", "}}");
				if (subId) return process(subId, subSp, subContent, "[[", "]]");
				if (dcId) return process(dcId, dcSp, dcContent, "((", "))");
				if (asId) return process(asId, asSp, asContent, ">]", "]");
				if (sqId) return process(sqId, sqSp, sqContent, "[", "]");
				if (rdId) return process(rdId, rdSp, rdContent, "(", ")");
				if (cuId) return process(cuId, cuSp, cuContent, "{", "}");

				return match;
			}
		);
	}
</script>

<div
	class="group relative my-4 overflow-x-auto rounded-lg bg-white p-4 dark:bg-gray-900"
	bind:this={container}
>
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

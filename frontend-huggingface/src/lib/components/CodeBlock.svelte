<script lang="ts">
	import CopyToClipBoardBtn from "./CopyToClipBoardBtn.svelte";
	import DOMPurify from "isomorphic-dompurify";
	import HtmlPreviewModal from "./HtmlPreviewModal.svelte";
	import PlayFilledAlt from "~icons/carbon/play-filled-alt";
	import Download from "~icons/carbon/download";
	import EosIconsLoading from "~icons/eos-icons/loading";

	interface Props {
		code?: string;
		rawCode?: string;
		lang?: string;
		loading?: boolean;
	}

	let { code = "", rawCode = "", lang = "", loading = false }: Props = $props();

	let previewOpen = $state(false);

	function hasStrictHtml5Doctype(input: string): boolean {
		if (!input) return false;
		const withoutBOM = input.replace(/^\uFEFF/, "");
		const trimmed = withoutBOM.trimStart();
		// Strict HTML5 doctype: <!doctype html> with optional whitespace before >
		return /^<!doctype\s+html\s*>/i.test(trimmed);
	}

	function isSvgDocument(input: string): boolean {
		const trimmed = input.trimStart();
		return /^(?:<\?xml[^>]*>\s*)?(?:<!doctype\s+svg[^>]*>\s*)?<svg[\s>]/i.test(trimmed);
	}

	let showPreview = $derived(hasStrictHtml5Doctype(rawCode) || isSvgDocument(rawCode));

	function getExtensionFromLang(lang: string): string {
		const langMap: Record<string, string> = {
			python: "py",
			javascript: "js",
			typescript: "ts",
			json: "json",
			html: "html",
			css: "css",
			markdown: "md",
			yaml: "yaml",
			sql: "sql",
			bash: "sh",
			shell: "sh",
			go: "go",
			rust: "rs",
			java: "java",
			cpp: "cpp",
			c: "c",
			csharp: "cs",
			xml: "xml",
			plaintext: "txt",
		};
		return langMap[lang.toLowerCase()] || "txt";
	}

	function generateFilename(content: string, lang: string): string {
		// Try to find a filename in comments
		const lines = content.split("\n");
		const firstFewLines = lines.slice(0, 5);
		
		// Look for common filename patterns in comments
		// e.g. # filename: script.py, // File: index.js, <!-- main.html -->
		const filenameRegex = /(?:filename|file):\s*([a-zA-Z0-9_\-\.]+)/i;
		
		for (const line of firstFewLines) {
			const match = line.match(filenameRegex);
			if (match && match[1]) {
				return match[1];
			}
		}

		const ext = getExtensionFromLang(lang);
		// If no filename found, use a generic name with timestamp to avoid collisions
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
		return `code-${timestamp}.${ext}`;
	}

	function getShebang(lang: string): string | null {
		const normalizedLang = lang.toLowerCase();
		if (normalizedLang === "python") return "#!/usr/bin/env python3";
		if (normalizedLang === "bash" || normalizedLang === "shell" || normalizedLang === "sh") return "#!/bin/bash";
		if (normalizedLang === "perl") return "#!/usr/bin/env perl";
		if (normalizedLang === "ruby") return "#!/usr/bin/env ruby";
		if (normalizedLang === "node" || normalizedLang === "javascript" || normalizedLang === "js") return "#!/usr/bin/env node";
		if (normalizedLang === "php") return "#!/usr/bin/env php";
		return null;
	}

	function prepareCodeForDownload(code: string, lang: string): string {
		const shebang = getShebang(lang);
		if (shebang && !code.startsWith("#!")) {
			return `${shebang}\n${code}`;
		}
		return code;
	}

	function downloadCode() {
		const filename = generateFilename(rawCode, lang);
		const contentToDownload = prepareCodeForDownload(rawCode, lang);
		const blob = new Blob([contentToDownload], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
	let displayCode = $derived.by(() => {
		const shebang = getShebang(lang);
		if (shebang && !rawCode.startsWith("#!")) {
			// If we're modifying the display code, we need to handle syntax highlighting
			// Since 'code' prop comes pre-highlighted from the parent (usually), 
			// we can't easily inject the shebang into the highlighted HTML without re-highlighting.
			// However, the request implies the shebang should be visible.
			// Ideally, we should prepend the shebang to the raw code before highlighting, 
			// but highlighting happens upstream in MarkdownRenderer or similar.
			// If we simply prepend text here, it won't be highlighted.
			
			// Option 1: Just prepend the text. It might look unstyled compared to the rest.
			// Option 2: Wrap it in a span with a comment class if we can guess the class name used by the highlighter (likely hljs-comment or similar).
			
			// Let's try to mimic a comment style.
			return `<span class="hljs-comment">${shebang}</span>\n${code}`;
		}
		return code;
	});

	let displayRawCode = $derived.by(() => {
		const shebang = getShebang(lang);
		if (shebang && !rawCode.startsWith("#!")) {
			return `${shebang}\n${rawCode}`;
		}
		return rawCode;
	});
</script>

<div class="group relative my-4 rounded-lg">
	<div class="pointer-events-none sticky top-0 w-full z-10">
		<div
			class="pointer-events-auto absolute flex items-center justify-between w-full px-4 py-2 bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur rounded-t-lg border-b border-gray-200 dark:border-gray-700"
		>
			<div class="text-xs font-mono text-gray-500 dark:text-gray-400">
				{lang}
			</div>
			<div class="flex items-center gap-1.5">
				{#if showPreview}
					<button
						class="btn h-7 gap-1 rounded-lg border px-2 text-xs shadow-sm backdrop-blur transition-none hover:border-gray-500 active:shadow-inner disabled:cursor-not-allowed disabled:opacity-80 dark:border-gray-600 dark:bg-gray-600/50 dark:hover:border-gray-500"
						disabled={loading}
						onclick={() => {
							if (!loading) {
								previewOpen = true;
							}
						}}
						title="Preview HTML"
						aria-label="Preview HTML"
					>
						{#if loading}
							<EosIconsLoading class="size-3.5" />
						{:else}
							<PlayFilledAlt class="size-3.5" />
						{/if}
						Preview
					</button>
				{/if}
				<button
					class="btn transition-none rounded-lg border size-7 text-sm shadow-sm dark:bg-gray-600/50 backdrop-blur dark:hover:border-gray-500 active:shadow-inner dark:border-gray-600 hover:border-gray-500 flex items-center justify-center"
					onclick={downloadCode}
					title="Download"
					aria-label="Download code"
				>
					<Download class="size-3.5" />
				</button>
				<CopyToClipBoardBtn
					iconClassNames="size-3.5"
					classNames="btn transition-none rounded-lg border size-7 text-sm shadow-sm dark:bg-gray-600/50 backdrop-blur dark:hover:border-gray-500 active:shadow-inner dark:border-gray-600 hover:border-gray-500"
					value={displayRawCode}
				/>
			</div>
		</div>
	</div>
	<pre class="scrollbar-custom overflow-auto px-5 py-4 pt-12 font-mono transition-[height]"><code
			><!-- eslint-disable svelte/no-at-html-tags -->{@html DOMPurify.sanitize(displayCode)}</code
		></pre>

	{#if previewOpen}
		<HtmlPreviewModal html={rawCode} onclose={() => (previewOpen = false)} />
	{/if}
</div>

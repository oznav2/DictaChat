<script lang="ts">
	import type { Message } from "$lib/types/Message";
	import { tick } from "svelte";
	import { detectRTLLanguage } from "$lib/utils/marked";

	import { usePublicConfig } from "$lib/utils/PublicConfig.svelte";
	const publicConfig = usePublicConfig();
	import CopyToClipBoardBtn from "../CopyToClipBoardBtn.svelte";
	import IconLoading from "../icons/IconLoading.svelte";
	import CarbonCopy from "~icons/carbon/copy";
	import CarbonRotate360 from "~icons/carbon/rotate-360";
	import CarbonDownload from "~icons/carbon/download";
	import JSZip from "jszip";

	import CarbonPen from "~icons/carbon/pen";
	import UploadedFile from "./UploadedFile.svelte";

	import MarkdownRenderer from "./MarkdownRenderer.svelte";
	import OpenReasoningResults from "./OpenReasoningResults.svelte";
	import Alternatives from "./Alternatives.svelte";
	import MessageAvatar from "./MessageAvatar.svelte";
	import { PROVIDERS_HUB_ORGS } from "@huggingface/inference";
	import { requireAuthUser } from "$lib/utils/auth";
	import ToolUpdate from "./ToolUpdate.svelte";
	import TracePanel from "./TracePanel.svelte";
	import MemoryContextIndicator from "./MemoryContextIndicator.svelte";
	import { isMessageToolUpdate, isMessageTraceUpdate } from "$lib/utils/messageUpdates";
	import {
		MessageUpdateType,
		MessageTraceUpdateType,
		type MessageToolUpdate,
		type MessageTraceUpdate
	} from "$lib/types/MessageUpdate";
	import { handleMessageTraceUpdate, runs, getActiveRunId } from "$lib/stores/traceStore";

	interface Props {
		message: Message;
		loading?: boolean;
		isAuthor?: boolean;
		readOnly?: boolean;
		isTapped?: boolean;
		alternatives?: Message["id"][];
		editMsdgId?: Message["id"] | null;
		isLast?: boolean;
		onretry?: (payload: { id: Message["id"]; content?: string }) => void;
		onshowAlternateMsg?: (payload: { id: Message["id"] }) => void;
	}

	let {
		message,
		loading = false,
		isAuthor: _isAuthor = true,
		readOnly: _readOnly = false,
		isTapped = $bindable(false),
		alternatives = [],
		editMsdgId = $bindable(null),
		isLast = false,
		onretry,
		onshowAlternateMsg,
	}: Props = $props();

	let contentEl: HTMLElement | undefined = $state();
	let isRTL = $derived(detectRTLLanguage(message.content));
	let isUserRTL = $derived(message.from === "user" && detectRTLLanguage(message.content));
	let isCopied = $state(false);
	let messageWidth: number = $state(0);
	let messageInfoWidth: number = $state(0);

	$effect(() => {
		// referenced to appease linter for currently-unused props
		void _isAuthor;
		void _readOnly;
	});
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
			editFormEl?.requestSubmit();
		}
		if (e.key === "Escape") {
			editMsdgId = null;
		}
	}

	function handleCopy(event: ClipboardEvent) {
		if (!contentEl) return;

		const selection = window.getSelection();
		if (!selection || selection.isCollapsed) return;
		if (!selection.anchorNode || !selection.focusNode) return;

		const anchorInside = contentEl.contains(selection.anchorNode);
		const focusInside = contentEl.contains(selection.focusNode);
		if (!anchorInside && !focusInside) return;

		if (!event.clipboardData) return;

		const range = selection.getRangeAt(0);
		const wrapper = document.createElement("div");
		wrapper.appendChild(range.cloneContents());

		wrapper.querySelectorAll("[data-exclude-from-copy]").forEach((el) => {
			el.remove();
		});

		wrapper.querySelectorAll("*").forEach((el) => {
			el.removeAttribute("style");
			el.removeAttribute("class");
			el.removeAttribute("color");
			el.removeAttribute("bgcolor");
			el.removeAttribute("background");

			for (const attr of Array.from(el.attributes)) {
				if (attr.name === "id" || attr.name.startsWith("data-")) {
					el.removeAttribute(attr.name);
				}
			}
		});

		const html = wrapper.innerHTML;
		const text = wrapper.textContent ?? "";

		event.preventDefault();
		event.clipboardData.setData("text/html", html);
		event.clipboardData.setData("text/plain", text);
	}

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
		if (normalizedLang === "bash" || normalizedLang === "shell" || normalizedLang === "sh")
			return "#!/bin/bash";
		if (normalizedLang === "perl") return "#!/usr/bin/env perl";
		if (normalizedLang === "ruby") return "#!/usr/bin/env ruby";
		if (normalizedLang === "node" || normalizedLang === "javascript" || normalizedLang === "js")
			return "#!/usr/bin/env node";
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

	async function downloadAllCodeBlocks() {
		const codeBlocks: { code: string; lang: string }[] = [];
		const zip = new JSZip();

		// Extract code blocks from the message content
		// This is a simplified extraction that mimics how MarkdownRenderer/CodeBlock works
		// In a real implementation, we might want to traverse the 'blocks' derived state
		// but since 'blocks' contains rendered HTML or chunks, we need to parse the raw content
		// or rely on the fact that we can get this info from the parsed tokens if available.
		// For now, let's iterate through the 'blocks' and see if we can find code blocks.
		// A better approach is to look at the 'blocks' array if it contains structured data
		// but currently 'blocks' are mostly text chunks.
		// However, we can use the marked tokens if we had access to them here, but we don't directly.
		// So we'll re-parse the content to find code blocks or use a regex for this specific action.

		const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
		let match;
		while ((match = codeBlockRegex.exec(contentWithoutThink)) !== null) {
			codeBlocks.push({
				lang: match[1] || "plaintext",
				code: match[2],
			});
		}

		if (codeBlocks.length === 0) return;

		if (codeBlocks.length === 1) {
			// If only one block, download it directly
			const { code, lang } = codeBlocks[0];
			const filename = generateFilename(code, lang);
			const contentToDownload = prepareCodeForDownload(code, lang);
			const blob = new Blob([contentToDownload], { type: "text/plain" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			return;
		}

		// Multiple blocks: Create a ZIP
		const usedFilenames = new Set<string>();

		codeBlocks.forEach(({ code, lang }) => {
			let filename = generateFilename(code, lang);

			// Handle duplicate filenames
			if (usedFilenames.has(filename)) {
				const nameParts = filename.split(".");
				const ext = nameParts.pop();
				const name = nameParts.join(".");
				let counter = 1;
				while (usedFilenames.has(`${name}-${counter}.${ext}`)) {
					counter++;
				}
				filename = `${name}-${counter}.${ext}`;
			}

			usedFilenames.add(filename);
			const contentToDownload = prepareCodeForDownload(code, lang);
			zip.file(filename, contentToDownload);
		});

		const content = await zip.generateAsync({ type: "blob" });
		const url = URL.createObjectURL(content);
		const a = document.createElement("a");
		a.href = url;
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
		a.download = `code-bundle-${timestamp}.zip`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	let editContentEl: HTMLTextAreaElement | undefined = $state();
	let editFormEl: HTMLFormElement | undefined = $state();

	// Zero-config reasoning autodetection: detect <think> blocks in content
	const THINK_BLOCK_REGEX = /(<think>[\s\S]*?(?:<\/think>|$))/gi;
	// Non-global version for .test() calls to avoid lastIndex side effects
	const THINK_BLOCK_TEST_REGEX = /(<think>[\s\S]*?(?:<\/think>|$))/i;
	let hasClientThink = $derived(message.content.split(THINK_BLOCK_REGEX).length > 1);

	// Strip think blocks for clipboard copy (always, regardless of detection)
	let contentWithoutThink = $derived.by(() =>
		message.content.replace(THINK_BLOCK_REGEX, "").trim()
	);

	type Block =
		| { type: "text"; content: string }
		| { type: "tool"; uuid: string; updates: MessageToolUpdate[] };

	let blocks = $derived.by(() => {
		const updates = message.updates ?? [];
		const res: Block[] = [];
		const hasTools = updates.some(isMessageToolUpdate);
		let contentCursor = 0;
		let sawFinalAnswer = false;

		// Fast path: no tool updates at all
		if (!hasTools && updates.length === 0) {
			if (message.content) return [{ type: "text" as const, content: message.content }];
			return [];
		}

		for (const update of updates) {
			if (update.type === MessageUpdateType.Stream) {
				const token =
					typeof update.token === "string" && update.token.length > 0 ? update.token : null;
				const len = token !== null ? token.length : (update.len ?? 0);
				const chunk =
					token ??
					(message.content ? message.content.slice(contentCursor, contentCursor + len) : "");
				contentCursor += len;
				if (!chunk) continue;
				const last = res.at(-1);
				if (last?.type === "text") last.content += chunk;
				else res.push({ type: "text" as const, content: chunk });
			} else if (isMessageToolUpdate(update)) {
				const last = res.at(-1);
				if (last?.type === "tool" && last.uuid === update.uuid) {
					last.updates.push(update);
				} else {
					res.push({ type: "tool" as const, uuid: update.uuid, updates: [update] });
				}
			} else if (update.type === MessageUpdateType.FinalAnswer) {
				sawFinalAnswer = true;
				const finalText = update.text ?? "";
				const currentText = res
					.filter((b) => b.type === "text")
					.map((b) => (b as { type: "text"; content: string }).content)
					.join("");

				let addedText = "";
				if (finalText.startsWith(currentText)) {
					addedText = finalText.slice(currentText.length);
				} else if (!currentText.endsWith(finalText)) {
					const needsGap = !/\n\n$/.test(currentText) && !/^\n/.test(finalText);
					addedText = (needsGap ? "\n\n" : "") + finalText;
				}

				if (addedText) {
					const last = res.at(-1);
					if (last?.type === "text") {
						last.content += addedText;
					} else {
						res.push({ type: "text" as const, content: addedText });
					}
				}
			}
		}

		// If content remains unmatched (e.g., persisted stream markers), append the remainder
		// Skip when a FinalAnswer already provided the authoritative text.
		if (!sawFinalAnswer && message.content && contentCursor < message.content.length) {
			const remaining = message.content.slice(contentCursor);
			if (remaining.length > 0) {
				const last = res.at(-1);
				if (last?.type === "text") last.content += remaining;
				else res.push({ type: "text" as const, content: remaining });
			}
		} else if (!res.some((b) => b.type === "text") && message.content) {
			// Fallback: no text produced at all
			res.push({ type: "text" as const, content: message.content });
		}

		return res;
	});

	$effect(() => {
		if (isCopied) {
			setTimeout(() => {
				isCopied = false;
			}, 1000);
		}
	});

	let hasCode = $derived(message.content.includes("```"));
	let codeBlockCount = $derived((message.content.match(/```/g) || []).length / 2);

	// Track trace updates and run ID for RAG panel
	let traceRunId: string | null = $state(null);
	let traceLanguage: "he" | "en" = $state("en");

	// Find the index where TracePanel should be inserted (after last tool block, before final response)
	let tracePanelInsertIndex = $derived.by(() => {
		if (!traceRunId) return -1;

		// Find the last tool block index
		let lastToolIndex = -1;
		for (let i = 0; i < blocks.length; i++) {
			if (blocks[i].type === "tool") {
				lastToolIndex = i;
			}
		}

		// If there are tool blocks, insert after the last one
		// Otherwise, insert after the first text block (reasoning)
		if (lastToolIndex >= 0) {
			return lastToolIndex + 1;
		}

		// If no tool blocks but there's reasoning (first text block with <think>), insert after it
		if (blocks.length > 0 && blocks[0].type === "text") {
			const firstContent = (blocks[0] as { type: "text"; content: string }).content;
			if (firstContent.includes("<think>") || firstContent.includes("</think>")) {
				return 1; // Insert after reasoning block
			}
		}

		return 0; // Insert at the beginning if nothing else
	});

	// Process trace updates from message updates
	$effect(() => {
		const updates = message.updates ?? [];
		for (const update of updates) {
			if (isMessageTraceUpdate(update)) {
				handleMessageTraceUpdate(update);
				// Track the run ID for this message
				if (update.subtype === MessageTraceUpdateType.RunCreated) {
					traceRunId = update.runId;
				}
			}
		}
	});

	let editMode = $derived(editMsdgId === message.id);
	$effect(() => {
		if (editMode) {
			tick();
			if (editContentEl) {
				editContentEl.value = message.content;
				editContentEl?.focus();
			}
		}
	});
</script>

{#if message.from === "assistant"}
	<div
		bind:offsetWidth={messageWidth}
		class="group relative -mb-4 flex w-fit max-w-full items-start justify-start gap-4 pb-4 leading-relaxed max-sm:mb-1 {message.routerMetadata &&
		messageInfoWidth >= messageWidth
			? 'mb-1'
			: ''}"
		data-message-id={message.id}
		data-message-role="assistant"
		role="presentation"
		onclick={() => (isTapped = !isTapped)}
		onkeydown={() => (isTapped = !isTapped)}
		dir={isRTL ? "rtl" : "ltr"}
	>
		<MessageAvatar
			classNames="mt-5 size-3.5 flex-none select-none rounded-full shadow-lg max-sm:hidden"
			animating={isLast && loading}
			modelName={message.routerMetadata?.model ?? ""}
		/>
		<div
			class="relative flex min-w-[60px] flex-col gap-2 break-words rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 px-5 py-3.5 text-gray-600 prose-pre:my-2 dark:border-gray-800 dark:from-gray-800/80 dark:text-gray-300"
		>
			{#if message.files?.length}
				<div class="flex h-fit flex-wrap gap-x-5 gap-y-2">
					{#each message.files as file (file.value)}
						<UploadedFile {file} canClose={false} />
					{/each}
				</div>
			{/if}

			<div bind:this={contentEl} oncopy={handleCopy}>
				{#if isLast && loading && blocks.length === 0}
					<IconLoading classNames="loading inline ml-2 first:ml-0" />
				{/if}
				{#each blocks as block, blockIndex (block.type === "tool" ? `${block.uuid}-${blockIndex}` : `text-${blockIndex}`)}
					{@const nextBlock = blocks[blockIndex + 1]}
					{@const nextBlockHasThink =
						nextBlock?.type === "text" && THINK_BLOCK_TEST_REGEX.test(nextBlock.content)}
					{@const nextIsLinkable = nextBlock?.type === "tool" || nextBlockHasThink}
					{#if traceRunId && blockIndex === tracePanelInsertIndex}
						<div class="my-3" data-exclude-from-copy>
							<TracePanel runId={traceRunId} language={traceLanguage} />
						</div>
					{/if}
					{#if block.type === "tool"}
						<div data-exclude-from-copy class="has-[+.prose]:mb-3 [.prose+&]:mt-4">
							<ToolUpdate tool={block.updates} {loading} hasNext={nextIsLinkable} />
						</div>
					{:else if block.type === "text"}
						{#if isLast && loading && block.content.length === 0}
							<IconLoading classNames="loading inline ml-2 first:ml-0" />
						{/if}

						{#if hasClientThink}
							{@const parts = block.content.split(THINK_BLOCK_REGEX)}
							{#each parts as part, partIndex}
								{@const remainingParts = parts.slice(partIndex + 1)}
								{@const hasMoreLinkable =
									remainingParts.some((p) => p && THINK_BLOCK_TEST_REGEX.test(p)) || nextIsLinkable}
								{#if part && part.startsWith("<think>")}
									{@const isClosed = part.endsWith("</think>")}
									{@const thinkContent = part.slice(7, isClosed ? -8 : undefined)}

									<OpenReasoningResults
										content={thinkContent}
										loading={isLast && loading && !isClosed}
										hasNext={hasMoreLinkable}
									/>
								{:else if part && part.trim().length > 0}
									<div
										class="prose max-w-none dark:prose-invert max-sm:prose-sm prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-base prose-pre:bg-gray-800 prose-img:my-0 prose-img:rounded-lg dark:prose-pre:bg-gray-900"
									>
										<MarkdownRenderer content={part} loading={isLast && loading} />
									</div>
								{/if}
							{/each}
						{:else}
							<div
								class="prose max-w-none dark:prose-invert max-sm:prose-sm prose-headings:font-semibold prose-h1:text-lg prose-h2:text-base prose-h3:text-base prose-pre:bg-gray-800 prose-img:my-0 prose-img:rounded-lg dark:prose-pre:bg-gray-900"
							>
								<MarkdownRenderer content={block.content} loading={isLast && loading} />
							</div>
						{/if}
					{/if}
				{/each}

				{#if traceRunId && tracePanelInsertIndex >= blocks.length}
					<div class="my-3" data-exclude-from-copy>
						<TracePanel runId={traceRunId} language={traceLanguage} />
					</div>
				{/if}

				<!-- Memory Context Indicator (citations, known context, feedback) -->
				<div data-exclude-from-copy>
					<MemoryContextIndicator
						messageId={message.id}
						isRTL={isRTL}
						isStreaming={isLast && loading}
					/>
				</div>
			</div>
		</div>

		{#if message.routerMetadata || (!loading && message.content)}
			<div
				class="absolute -bottom-3.5 {message.routerMetadata && messageInfoWidth > messageWidth
					? 'left-1 pl-1 lg:pl-7'
					: 'right-1'} flex max-w-[calc(100dvw-40px)] items-center gap-0.5"
				bind:offsetWidth={messageInfoWidth}
			>
				{#if message.routerMetadata && (message.routerMetadata.route || message.routerMetadata.model || message.routerMetadata.provider) && (!isLast || !loading)}
					<div
						class="mr-2 flex items-center gap-1.5 truncate whitespace-nowrap text-[.65rem] text-gray-400 dark:text-gray-400 sm:text-xs"
					>
						{#if message.routerMetadata.route && message.routerMetadata.model}
							<span class="truncate rounded bg-gray-100 px-1 font-mono dark:bg-gray-800 sm:py-px">
								{message.routerMetadata.route}
							</span>
							<span class="text-gray-500">with</span>
							{#if publicConfig.isHuggingChat}
								<a
									href="/chat/settings/{message.routerMetadata.model}"
									class="flex items-center gap-1 truncate rounded bg-gray-100 px-1 font-mono hover:text-gray-500 dark:bg-gray-800 dark:hover:text-gray-300 sm:py-px"
								>
									{message.routerMetadata.model.split("/").pop()}
								</a>
							{:else}
								<span
									class="truncate rounded bg-gray-100 px-1.5 font-mono dark:bg-gray-800 sm:py-px"
								>
									{message.routerMetadata.model.split("/").pop()}
								</span>
							{/if}
						{/if}
						{#if message.routerMetadata.provider}
							{@const hubOrg = PROVIDERS_HUB_ORGS[message.routerMetadata.provider]}
							<span class="text-gray-500 max-sm:hidden">via</span>
							<a
								target="_blank"
								href="https://huggingface.co/{hubOrg}"
								class="flex items-center gap-1 truncate rounded bg-gray-100 px-1 font-mono hover:text-gray-500 dark:bg-gray-800 dark:hover:text-gray-300 max-sm:hidden sm:py-px"
							>
								<img
									src="https://huggingface.co/api/avatars/{hubOrg}"
									alt="{message.routerMetadata.provider} logo"
									class="size-2.5 flex-none rounded-sm"
									onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
								/>
								{message.routerMetadata.provider}
							</a>
						{/if}
					</div>
				{/if}
				{#if !isLast || !loading}
					{#if hasCode}
						<button
							class="btn rounded-sm p-1 text-xs text-gray-400 hover:text-gray-500 focus:ring-0 dark:text-gray-400 dark:hover:text-gray-300"
							title={codeBlockCount > 1 ? "Download All Code" : "Download Code"}
							type="button"
							onclick={downloadAllCodeBlocks}
						>
							<CarbonDownload />
						</button>
					{/if}
					<CopyToClipBoardBtn
						onClick={() => {
							isCopied = true;
						}}
						classNames="btn rounded-sm p-1 text-sm text-gray-400 hover:text-gray-500 focus:ring-0 dark:text-gray-400 dark:hover:text-gray-300"
						value={contentWithoutThink}
						iconClassNames="text-xs"
					/>
					<button
						class="btn rounded-sm p-1 text-xs text-gray-400 hover:text-gray-500 focus:ring-0 dark:text-gray-400 dark:hover:text-gray-300"
						title="Retry"
						type="button"
						onclick={() => {
							onretry?.({ id: message.id });
						}}
					>
						<CarbonRotate360 />
					</button>
					{#if alternatives.length > 1 && editMsdgId === null}
						<Alternatives
							{message}
							{alternatives}
							{loading}
							onshowAlternateMsg={(payload) => onshowAlternateMsg?.(payload)}
						/>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
{/if}
{#if message.from === "user"}
	<div
		class="group relative {alternatives.length > 1 && editMsdgId === null
			? 'mb-10'
			: 'mb-6'} w-full items-start justify-start gap-4 max-sm:text-sm"
		data-message-id={message.id}
		data-message-type="user"
		role="presentation"
		onclick={() => (isTapped = !isTapped)}
		onkeydown={() => (isTapped = !isTapped)}
		dir={isUserRTL ? "rtl" : "ltr"}
	>
		<div class="flex w-full flex-col items-start gap-2">
			{#if message.files?.length}
				<div class="flex w-fit gap-4 px-5">
					{#each message.files as file}
						<UploadedFile {file} canClose={false} />
					{/each}
				</div>
			{/if}

			<div class="flex w-full flex-row flex-nowrap">
				{#if !editMode}
					<p
						class="disabled w-full appearance-none whitespace-break-spaces text-wrap break-words rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 px-5 py-3.5 text-gray-700 shadow-sm dark:border-blue-900/30 dark:from-blue-950/30 dark:text-gray-300"
					>
						{message.content.trim()}
					</p>
					<div
						class="invisible absolute -bottom-8 flex items-center gap-2 text-gray-400 opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100 dark:text-gray-500 {isUserRTL
							? 'right-0'
							: 'left-0'}"
					>
						<span class="select-none text-xs"
							>{new Date(message.createdAt || "").toLocaleDateString()}</span
						>
						<button
							class="rounded p-1.5 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300"
							title="Resend"
							type="button"
							onclick={() => {
								if (requireAuthUser()) return;
								onretry?.({ id: message.id });
							}}
						>
							<CarbonRotate360 class="size-4" />
						</button>
						<button
							class="rounded p-1.5 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300"
							title="Edit"
							type="button"
							onclick={() => {
								if (requireAuthUser()) return;
								editMsdgId = message.id;
							}}
						>
							<CarbonPen class="size-4" />
						</button>
						<CopyToClipBoardBtn
							classNames="rounded p-1.5 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors duration-200"
							value={message.content}
							iconClassNames="size-4"
						/>
					</div>
				{:else}
					<form
						class="mt-2 flex w-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
						bind:this={editFormEl}
						onsubmit={(e) => {
							e.preventDefault();
							onretry?.({ content: editContentEl?.value, id: message.id });
							editMsdgId = null;
						}}
					>
						<textarea
							class="w-full resize-none whitespace-break-spaces break-words bg-transparent px-5 py-3.5 text-gray-800 focus:outline-none dark:text-gray-100"
							rows="3"
							bind:this={editContentEl}
							value={message.content.trim()}
							onkeydown={handleKeyDown}
							dir={isUserRTL ? "rtl" : "ltr"}
							required
						></textarea>
						<div
							class="flex w-full items-center justify-between border-t border-gray-100 bg-gray-50/50 px-2 py-2 dark:border-gray-800 dark:bg-gray-800/50"
						>
							<div class="flex items-center gap-2 px-2 text-xs text-gray-500">
								<span
									class="size-3.5 rounded-full border border-gray-400 text-center font-mono text-[8px] leading-[12px]"
									>i</span
								>
								Editing this message will create a new conversation branch.
							</div>
							<div class="flex gap-2">
								<button
									type="button"
									class="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
									onclick={() => {
										editMsdgId = null;
									}}
								>
									Cancel
								</button>
								<button
									type="submit"
									class="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-100"
									disabled={loading}
								>
									Save
								</button>
							</div>
						</div>
					</form>
				{/if}
			</div>
			<div
				class="absolute -bottom-4 {isUserRTL ? 'mr-3.5' : 'ml-3.5'} flex w-full gap-1.5 {isUserRTL
					? 'flex-row-reverse'
					: ''}"
			>
				{#if alternatives.length > 1 && editMsdgId === null}
					<Alternatives
						{message}
						{alternatives}
						{loading}
						onshowAlternateMsg={(payload) => onshowAlternateMsg?.(payload)}
					/>
				{/if}
				{#if (alternatives.length > 1 && editMsdgId === null) || (!loading && !editMode)}
					<button
						class="hidden cursor-pointer items-center gap-1 rounded-md border border-gray-200 px-1.5 py-0.5 text-xs text-gray-400 group-hover:flex hover:flex hover:text-gray-500 dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-300 lg:-right-2"
						title="Edit"
						type="button"
						onclick={() => {
							if (requireAuthUser()) return;
							editMsdgId = message.id;
						}}
					>
						<CarbonPen />
						עריכה
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes loading {
		to {
			stroke-dashoffset: 122.9;
		}
	}
</style>

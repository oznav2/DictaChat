<script lang="ts">
	import { slide, scale } from "svelte/transition";
	import { cubicOut, backOut } from "svelte/easing";
	import { browser } from "$app/environment";
	import { MessageToolUpdateType, type MessageToolUpdate } from "$lib/types/MessageUpdate";
	import {
		isMessageToolCallUpdate,
		isMessageToolErrorUpdate,
		isMessageToolResultUpdate,
	} from "$lib/utils/messageUpdates";
	import LucideHammer from "~icons/lucide/hammer";
	import LucideCheck from "~icons/lucide/check";
	import { ToolResultStatus, type ToolFront } from "$lib/types/Tool";
	import { page } from "$app/state";
	import CarbonChevronRight from "~icons/carbon/chevron-right";
	import BlockWrapper from "./BlockWrapper.svelte";
	
	// Respect user's motion preferences
	const prefersReducedMotion = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	interface Props {
		tool: MessageToolUpdate[];
		loading?: boolean;
		hasNext?: boolean;
	}

	let { tool, loading = false, hasNext = false }: Props = $props();

	let isOpen = $state(false);

	let toolFnName = $derived(tool.find(isMessageToolCallUpdate)?.call.name);
	let toolError = $derived(tool.some(isMessageToolErrorUpdate));
	let toolDone = $derived(tool.some(isMessageToolResultUpdate));
	let isExecuting = $derived(!toolDone && !toolError && loading);
	let toolSuccess = $derived(toolDone && !toolError);

	const availableTools: ToolFront[] = $derived.by(
		() => (page.data as { tools?: ToolFront[] } | undefined)?.tools ?? []
	);

	type ToolOutput = Record<string, unknown>;
	type McpImageContent = {
		type: "image";
		data: string;
		mimeType: string;
	};

	const formatValue = (value: unknown): string => {
		if (value == null) return "";
		if (typeof value === "object") {
			try {
				return JSON.stringify(value, null, 2);
			} catch {
				return String(value);
			}
		}
		return String(value);
	};

	const getOutputText = (output: ToolOutput): string | undefined => {
		const maybeText = output["text"];
		if (typeof maybeText !== "string") return undefined;
		return maybeText;
	};

	const isImageBlock = (value: unknown): value is McpImageContent => {
		if (typeof value !== "object" || value === null) return false;
		const obj = value as Record<string, unknown>;
		return (
			obj["type"] === "image" &&
			typeof obj["data"] === "string" &&
			typeof obj["mimeType"] === "string"
		);
	};

	const getImageBlocks = (output: ToolOutput): McpImageContent[] => {
		const blocks = output["content"];
		if (!Array.isArray(blocks)) return [];
		return blocks.filter(isImageBlock);
	};

	const getMetadataEntries = (output: ToolOutput): Array<[string, unknown]> => {
		return Object.entries(output).filter(
			([key, value]) => value != null && key !== "content" && key !== "text"
		);
	};

	interface ParsedToolOutput {
		text?: string;
		images: McpImageContent[];
		metadata: Array<[string, unknown]>;
	}

	const parseToolOutputs = (outputs: ToolOutput[]): ParsedToolOutput[] =>
		outputs.map((output) => ({
			text: getOutputText(output),
			images: getImageBlocks(output),
			metadata: getMetadataEntries(output),
		}));

	// Icon styling based on state
	let iconBg = $derived(
		toolError ? "bg-red-100 dark:bg-red-900/40" : "bg-purple-100 dark:bg-purple-900/40"
	);

	let iconRing = $derived(
		toolError ? "ring-red-200 dark:ring-red-500/30" : "ring-purple-200 dark:ring-purple-500/30"
	);
</script>

{#snippet icon()}
	{#if toolSuccess}
		<div class="tool-success-icon" in:scale={{ duration: prefersReducedMotion ? 0 : 300, easing: backOut }}>
			<LucideCheck class="size-3.5 text-purple-600 dark:text-purple-400" />
		</div>
	{:else}
		<div class="tool-icon {isExecuting ? 'tool-executing' : ''}">
			<LucideHammer
				class="size-3.5 {toolError
					? 'text-red-500 dark:text-red-400'
					: 'text-purple-600 dark:text-purple-400'}"
			/>
		</div>
	{/if}
{/snippet}

{#if toolFnName}
	<BlockWrapper {icon} {iconBg} {iconRing} {hasNext} loading={isExecuting}>
		<!-- Header row -->
		<div class="tool-header flex w-full select-none items-center gap-2">
			<button
				type="button"
				class="flex flex-1 cursor-pointer items-center gap-2 text-left transition-colors duration-200"
				onclick={() => (isOpen = !isOpen)}
				aria-expanded={isOpen}
			>
				<span
					class="tool-label text-sm font-medium transition-colors duration-200 {isExecuting
						? 'text-purple-700 dark:text-purple-300'
						: toolError
							? 'text-red-600 dark:text-red-400'
							: 'text-gray-700 dark:text-gray-300'}"
				>
					{toolError ? "Error calling" : toolDone ? "Called" : "Calling"} tool
					<code
						class="tool-name rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-500 opacity-90 transition-colors duration-200 dark:bg-gray-800 dark:text-gray-400"
					>
						{availableTools.find((entry) => entry.name === toolFnName)?.displayName ?? toolFnName}
					</code>
				</span>
			</button>

			<button
				type="button"
				class="chevron-btn cursor-pointer rounded p-0.5 transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-gray-700"
				onclick={() => (isOpen = !isOpen)}
				aria-label={isOpen ? "Collapse" : "Expand"}
			>
				<CarbonChevronRight
					class="chevron-icon size-4 text-gray-400 transition-transform duration-300 ease-out {isOpen ? 'rotate-90' : ''}"
				/>
			</button>
		</div>

		<!-- Expandable content -->
		{#if isOpen}
			<div 
				class="tool-content mt-2 space-y-3"
				transition:slide={{ duration: prefersReducedMotion ? 0 : 250, easing: cubicOut }}
			>
				{#each tool as update, i (`${update.subtype}-${i}`)}
					{#if update.subtype === MessageToolUpdateType.Call}
						<div class="tool-section space-y-1">
							<div
								class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500"
							>
								Input
							</div>
							<div
								class="rounded-md border border-gray-100 bg-white p-2 text-gray-500 transition-colors duration-200 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400"
							>
								<pre class="whitespace-pre-wrap break-all font-mono text-xs">{formatValue(
										update.call.parameters
									)}</pre>
							</div>
						</div>
					{:else if update.subtype === MessageToolUpdateType.Error}
						<div class="tool-section tool-error-section space-y-1">
							<div
								class="text-[10px] font-semibold uppercase tracking-wider text-red-500 dark:text-red-400"
							>
								Error
							</div>
							<div
								class="rounded-md border border-red-200 bg-red-50 p-2 text-red-600 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-400"
							>
								<pre class="whitespace-pre-wrap break-all font-mono text-xs">{update.message}</pre>
							</div>
						</div>
					{:else if isMessageToolResultUpdate(update) && update.result.status === ToolResultStatus.Success && update.result.display}
						<div class="tool-section tool-success-section space-y-1">
							<div class="flex items-center gap-2">
								<div
									class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500"
								>
									Output
								</div>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="success-checkmark text-emerald-500"
								>
									<circle cx="12" cy="12" r="10"></circle>
									<path d="m9 12 2 2 4-4"></path>
								</svg>
							</div>
							<div
								class="scrollbar-custom rounded-md border border-gray-100 bg-white p-2 text-gray-500 transition-colors duration-200 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400"
							>
								{#each parseToolOutputs(update.result.outputs) as parsedOutput}
									<div class="space-y-2">
										{#if parsedOutput.text}
											<pre
												class="scrollbar-custom max-h-60 overflow-y-auto whitespace-pre-wrap break-all font-mono text-xs">{parsedOutput.text}</pre>
										{/if}

										{#if parsedOutput.images.length > 0}
											<div class="flex flex-wrap gap-2">
												{#each parsedOutput.images as image, imageIndex}
													<img
														alt={`Tool result image ${imageIndex + 1}`}
														class="max-h-60 rounded border border-gray-200 transition-transform duration-200 hover:scale-[1.02] dark:border-gray-700"
														src={`data:${image.mimeType};base64,${image.data}`}
													/>
												{/each}
											</div>
										{/if}

										{#if parsedOutput.metadata.length > 0}
											<pre class="whitespace-pre-wrap break-all font-mono text-xs">{formatValue(
													Object.fromEntries(parsedOutput.metadata)
												)}</pre>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{:else if isMessageToolResultUpdate(update) && update.result.status === ToolResultStatus.Error && update.result.display}
						<div class="tool-section tool-error-section space-y-1">
							<div
								class="text-[10px] font-semibold uppercase tracking-wider text-red-500 dark:text-red-400"
							>
								Error
							</div>
							<div
								class="rounded-md border border-red-200 bg-red-50 p-2 text-red-600 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-400"
							>
								<pre class="whitespace-pre-wrap break-all font-mono text-xs">{update.result
										.message}</pre>
							</div>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</BlockWrapper>
{/if}

<style>
	/* Tool icon animations */
	.tool-icon {
		transition: transform 0.2s ease;
	}

	.tool-executing {
		animation: toolPulse 1.5s ease-in-out infinite;
	}

	@keyframes toolPulse {
		0%, 100% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.1);
			opacity: 0.8;
		}
	}

	/* Success icon pop animation */
	.tool-success-icon {
		animation: successPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes successPop {
		0% {
			transform: scale(0);
			opacity: 0;
		}
		70% {
			transform: scale(1.2);
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}

	/* Success checkmark animation */
	.success-checkmark {
		animation: checkPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
	}

	@keyframes checkPop {
		0% {
			transform: scale(0);
			opacity: 0;
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}

	/* Content fade-in within slide */
	.tool-content {
		animation: contentFadeIn 0.25s ease-out 0.05s both;
	}

	@keyframes contentFadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* Section stagger animation */
	.tool-section {
		animation: sectionSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.tool-section:nth-child(1) { animation-delay: 0ms; }
	.tool-section:nth-child(2) { animation-delay: 50ms; }
	.tool-section:nth-child(3) { animation-delay: 100ms; }
	.tool-section:nth-child(n+4) { animation-delay: 150ms; }

	@keyframes sectionSlideIn {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Error section shake on appearance */
	.tool-error-section {
		animation: errorShake 0.4s ease-out;
	}

	@keyframes errorShake {
		0%, 100% {
			transform: translateX(0);
		}
		20% {
			transform: translateX(-4px);
		}
		40% {
			transform: translateX(4px);
		}
		60% {
			transform: translateX(-2px);
		}
		80% {
			transform: translateX(2px);
		}
	}

	/* Mobile touch feedback */
	@media (hover: none) {
		.tool-header:active {
			transform: scale(0.99);
			transition: transform 0.1s ease;
		}
	}

	/* Reduced motion support */
	@media (prefers-reduced-motion: reduce) {
		.tool-icon,
		.tool-executing,
		.tool-success-icon,
		.success-checkmark,
		.tool-content,
		.tool-section,
		.tool-error-section,
		.tool-header {
			animation: none !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>

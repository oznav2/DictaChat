<script lang="ts">
	/**
	 * SourceBadge - Shows tool attribution for memory items
	 *
	 * Features:
	 * - Bilingual labels (Hebrew/English)
	 * - Tool icon and color
	 * - Expandable details with URL, description, context
	 */

	import { getToolInfo } from "./toolRegistry";
	import { clamp01, scoreToBgColor } from "$lib/utils/memoryScore";

	interface Props {
		toolName?: string | null;
		url?: string | null;
		description?: string | null;
		descriptionHe?: string | null;
		conversationTitle?: string | null;
		collectedAt?: Date | string | null;
		showDetails?: boolean;
		score?: number | null;
		lang?: "he" | "en";
	}

	let {
		toolName = null,
		url = null,
		description = null,
		descriptionHe = null,
		conversationTitle = null,
		collectedAt = null,
		showDetails = false,
		score = null,
		lang = "he",
	}: Props = $props();

	const tool = $derived(getToolInfo(toolName));
	const label = $derived(lang === "he" ? tool.labelHe : tool.labelEn);
	const desc = $derived(lang === "he" && descriptionHe ? descriptionHe : description);
	const normalizedScore = $derived(score === null || score === undefined ? null : clamp01(score));

	const dateStr = $derived(
		collectedAt ? new Date(collectedAt).toLocaleDateString(lang === "he" ? "he-IL" : "en-US") : null
	);

	const domain = $derived.by(() => {
		if (!url) return null;
		try {
			return new URL(url).hostname.replace("www.", "");
		} catch {
			return null;
		}
	});
</script>

<div class="source-badge text-gray-200" dir={lang === "he" ? "rtl" : "ltr"}>
	<!-- Compact badge -->
	<div class="flex items-center gap-2 text-sm">
		<span class="text-lg">{tool.icon}</span>
		<span class="rounded px-2 py-0.5 text-xs text-white {tool.color}">
			{label}
		</span>
		{#if normalizedScore !== null}
			<div class="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700/60">
				<div
					class={["h-full rounded-full", scoreToBgColor(normalizedScore)]}
					style="width: {Math.max(0, Math.min(100, normalizedScore * 100))}%"
				></div>
			</div>
		{/if}
		{#if domain}
			<a
				href={url}
				target="_blank"
				rel="noopener noreferrer"
				class="max-w-[150px] truncate text-xs text-blue-400 hover:underline"
			>
				{domain}
			</a>
		{/if}
	</div>

	<!-- Expanded details -->
	{#if showDetails}
		<div class="mt-2 space-y-1 rounded bg-gray-800/50 p-2 text-sm">
			{#if desc}
				<p class="text-gray-300">{desc}</p>
			{/if}
			{#if conversationTitle}
				<p class="text-xs text-gray-500">
					{lang === "he" ? "משיחה:" : "From chat:"}
					{conversationTitle}
				</p>
			{/if}
			{#if dateStr}
				<p class="text-xs text-gray-500">
					{lang === "he" ? "נאסף:" : "Collected:"}
					{dateStr}
				</p>
			{/if}
			{#if url}
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					class="block truncate text-xs text-blue-400 hover:underline"
				>
					{url}
				</a>
			{/if}
		</div>
	{/if}
</div>

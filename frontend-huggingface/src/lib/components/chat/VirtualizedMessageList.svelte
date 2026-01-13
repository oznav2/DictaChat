<script lang="ts">
	/**
	 * VirtualizedMessageList - Performance optimization for long conversations
	 * 
	 * Implements message virtualization using svelte-tiny-virtual-list.
	 * Only renders messages that are visible in the viewport, reducing DOM nodes
	 * and improving performance for conversations with many messages.
	 * 
	 * RoamPal v0.2.11 Critical Fix #2: Message History Performance
	 * Reference: ui-implementation/src/components/TerminalMessageThread.tsx
	 * 
	 * Features:
	 * - Variable height support via estimatedItemSize
	 * - Scroll to bottom for new messages
	 * - Maintains scroll position when viewing history
	 * - Overscan for smoother scrolling
	 */
	import type { Message } from "$lib/types/Message";
	import VirtualList from "svelte-tiny-virtual-list";
	import ChatMessage from "./ChatMessage.svelte";

	interface Props {
		messages: Message[];
		loading?: boolean;
		shared?: boolean;
		isReadOnly?: boolean;
		editMsdgId?: Message["id"] | null;
		alternativesByMessageId?: Map<Message["id"], Message["id"][]>;
		height?: number;
		onretry?: (payload: { id: Message["id"]; content?: string }) => void;
		onshowAlternateMsg?: (payload: { id: Message["id"] }) => void;
	}

	let {
		messages = [],
		loading = false,
		shared = false,
		isReadOnly = false,
		editMsdgId = $bindable(null),
		alternativesByMessageId = new Map(),
		height = 600,
		onretry,
		onshowAlternateMsg,
	}: Props = $props();

	// Estimate message heights based on content
	// User messages are typically shorter, assistant messages vary
	function estimateItemSize(index: number): number {
		const message = messages[index];
		if (!message) return 150; // Default height
		
		const contentLength = message.content?.length ?? 0;
		const hasFiles = (message.files?.length ?? 0) > 0;
		const hasUpdates = (message.updates?.length ?? 0) > 0;
		
		// Base height
		let baseHeight = message.from === "user" ? 80 : 120;
		
		// Add height based on content length (rough estimate: 60 chars per line, 24px per line)
		const estimatedLines = Math.ceil(contentLength / 60);
		baseHeight += Math.min(estimatedLines * 24, 800); // Cap at 800px for very long messages
		
		// Add height for files
		if (hasFiles) {
			baseHeight += 100 * (message.files?.length ?? 0);
		}
		
		// Add height for tool updates
		if (hasUpdates) {
			baseHeight += 60 * Math.min(message.updates?.length ?? 0, 5);
		}
		
		// Add gap between messages
		baseHeight += 32;
		
		return baseHeight;
	}

	// Calculate grouping with previous message
	function isGroupedWithPrevious(index: number): boolean {
		if (index === 0) return false;
		
		const prev = messages[index - 1];
		const curr = messages[index];
		
		if (prev.from !== curr.from) return false;
		
		const prevTime = prev.createdAt instanceof Date
			? prev.createdAt.getTime()
			: prev.createdAt
				? new Date(prev.createdAt as unknown as string).getTime()
				: null;
		const currTime = curr.createdAt instanceof Date
			? curr.createdAt.getTime()
			: curr.createdAt
				? new Date(curr.createdAt as unknown as string).getTime()
				: null;
		
		if (prevTime === null || currTime === null) return false;
		
		// Group if within 2 minutes
		return currTime - prevTime < 2 * 60 * 1000;
	}

	// Virtual list reference for scroll control
	let virtualListRef: VirtualList | undefined = $state();

	// Scroll to bottom when new messages arrive
	$effect(() => {
		if (messages.length > 0 && virtualListRef) {
			// Use scrollToIndex to jump to the last message
			virtualListRef.scrollToIndex?.(messages.length - 1);
		}
	});

	// Estimated total size for better initial render
	const estimatedItemSizeValue = 150;
</script>

<VirtualList
	bind:this={virtualListRef}
	width="100%"
	{height}
	itemCount={messages.length}
	itemSize={estimateItemSize}
	estimatedItemSize={estimatedItemSizeValue}
	overscanCount={5}
	scrollToBehaviour="smooth"
>
	{#snippet item({ style, index })}
		{@const message = messages[index]}
		{@const groupedWithPrevious = isGroupedWithPrevious(index)}
		{@const isLast = index === messages.length - 1}
		<div {style} class="px-5">
			<ChatMessage
				{message}
				loading={isLast ? loading : false}
				{groupedWithPrevious}
				alternatives={alternativesByMessageId.get(message.id) ?? []}
				isAuthor={!shared}
				readOnly={isReadOnly}
				{isLast}
				bind:editMsdgId
				onretry={(payload) => onretry?.(payload)}
				onshowAlternateMsg={(payload) => onshowAlternateMsg?.(payload)}
			/>
		</div>
	{/snippet}
</VirtualList>

<style>
	:global(.virtual-list-wrapper) {
		scrollbar-width: thin;
		scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
	}
	
	:global(.virtual-list-wrapper::-webkit-scrollbar) {
		width: 6px;
	}
	
	:global(.virtual-list-wrapper::-webkit-scrollbar-track) {
		background: transparent;
	}
	
	:global(.virtual-list-wrapper::-webkit-scrollbar-thumb) {
		background-color: rgba(156, 163, 175, 0.5);
		border-radius: 3px;
	}
</style>

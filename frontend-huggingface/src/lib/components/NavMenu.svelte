<script lang="ts" module>
	export const titles: { [key: string]: string } = {
		today: "היום",
		week: "השבוע",
		month: "החודש",
		older: "ישן מאוד",
	} as const;
</script>

<script lang="ts">
	import { base } from "$app/paths";

	import Logo from "$lib/components/icons/Logo.svelte";
	import IconSun from "$lib/components/icons/IconSun.svelte";
	import IconMoon from "$lib/components/icons/IconMoon.svelte";
	import { switchTheme, subscribeToTheme } from "$lib/switchTheme";
	import { isAborted } from "$lib/stores/isAborted";
	import { onDestroy } from "svelte";

	import NavConversationItem from "./NavConversationItem.svelte";
	import type { LayoutData } from "../../routes/$types";
	import type { ConvSidebar } from "$lib/types/ConvSidebar";
	import type { Model } from "$lib/types/Model";
	import { page } from "$app/state";
	import InfiniteScroll from "./InfiniteScroll.svelte";
	import { CONV_NUM_PER_PAGE } from "$lib/constants/pagination";
	import { browser } from "$app/environment";
	import { usePublicConfig } from "$lib/utils/PublicConfig.svelte";
	import { useAPIClient, handleResponse } from "$lib/APIClient";
	import { requireAuthUser } from "$lib/utils/auth";
	import { enabledServersCount } from "$lib/stores/mcpServers";
	import MCPServerManager from "./mcp/MCPServerManager.svelte";

	const publicConfig = usePublicConfig();
	const client = useAPIClient();

	interface Props {
		conversations: ConvSidebar[];
		user: LayoutData["user"];
		p?: number;
		ondeleteConversation?: (id: string) => void;
		oneditConversationTitle?: (payload: { id: string; title: string }) => void;
		sidebarWidth?: number;
		onSidebarResize?: (width: number) => void;
	}

	let {
		conversations = $bindable(),
		user,
		p = $bindable(0),
		ondeleteConversation,
		oneditConversationTitle,
		sidebarWidth,
		onSidebarResize,
	}: Props = $props();

	let hasMore = $state(true);

	function handleNewChatClick(e: MouseEvent) {
		isAborted.set(true);

		if (requireAuthUser()) {
			e.preventDefault();
		}
	}

	function handleNavItemClick(e: MouseEvent) {
		if (requireAuthUser()) {
			e.preventDefault();
		}
	}

	const dateRanges = [
		new Date().setDate(new Date().getDate() - 1),
		new Date().setDate(new Date().getDate() - 7),
		new Date().setMonth(new Date().getMonth() - 1),
	];

	let groupedConversations = $derived({
		today: conversations.filter(({ updatedAt }) => updatedAt.getTime() > dateRanges[0]),
		week: conversations.filter(
			({ updatedAt }) => updatedAt.getTime() > dateRanges[1] && updatedAt.getTime() < dateRanges[0]
		),
		month: conversations.filter(
			({ updatedAt }) => updatedAt.getTime() > dateRanges[2] && updatedAt.getTime() < dateRanges[1]
		),
		older: conversations.filter(({ updatedAt }) => updatedAt.getTime() < dateRanges[2]),
	});

	const nModels: number = page.data.models.filter((el: Model) => !el.unlisted).length;

	async function handleVisible() {
		p++;
		const newConvs = await client.conversations
			.get({
				query: {
					p,
				},
			})
			.then(handleResponse)
			.then((r) => r.conversations)
			.catch((): ConvSidebar[] => []);

		if (newConvs.length === 0) {
			hasMore = false;
		}

		conversations = [...conversations, ...newConvs];
	}

	$effect(() => {
		if (conversations.length <= CONV_NUM_PER_PAGE) {
			// reset p to 0 if there's only one page of content
			// that would be caused by a data loading invalidation
			p = 0;
		}
	});

	let isDark = $state(false);
	let unsubscribeTheme: (() => void) | undefined;
	let showMcpModal = $state(false);

	const NAV_MIN_WIDTH = 200;
	const NAV_MAX_WIDTH = 500;
	const NAV_DEFAULT_WIDTH = 290;

	let isResizing = $state(false);
	let resizeStartX = 0;
	let resizeStartWidth = 0;

	function clampSidebarWidth(width: number) {
		return Math.min(NAV_MAX_WIDTH, Math.max(NAV_MIN_WIDTH, width));
	}

	function handlePointerDown(event: PointerEvent) {
		if (!browser) return;

		event.preventDefault();

		isResizing = true;
		resizeStartX = event.clientX;
		resizeStartWidth = sidebarWidth ?? NAV_DEFAULT_WIDTH;

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
	}

	function handlePointerMove(event: PointerEvent) {
		if (!isResizing) return;

		const deltaX = event.clientX - resizeStartX;
		const nextWidth = clampSidebarWidth(resizeStartWidth + deltaX);

		onSidebarResize?.(nextWidth);
	}

	function handlePointerUp() {
		if (!isResizing) return;

		isResizing = false;
		if (!browser) return;

		window.removeEventListener("pointermove", handlePointerMove);
		window.removeEventListener("pointerup", handlePointerUp);
	}

	function handleResizeKeydown(event: KeyboardEvent) {
		if (!onSidebarResize) return;

		const step = 16;
		const current = clampSidebarWidth(sidebarWidth ?? NAV_DEFAULT_WIDTH);
		let handled = true;

		if (event.key === "ArrowLeft") {
			onSidebarResize(clampSidebarWidth(current - step));
		} else if (event.key === "ArrowRight") {
			onSidebarResize(clampSidebarWidth(current + step));
		} else if (event.key === "Home") {
			onSidebarResize(NAV_MIN_WIDTH);
		} else if (event.key === "End") {
			onSidebarResize(NAV_MAX_WIDTH);
		} else {
			handled = false;
		}

		if (handled) {
			event.preventDefault();
		}
	}

	if (browser) {
		unsubscribeTheme = subscribeToTheme(({ isDark: nextIsDark }) => {
			isDark = nextIsDark;
		});
	}

	onDestroy(() => {
		unsubscribeTheme?.();
		if (!browser) return;

		window.removeEventListener("pointermove", handlePointerMove);
		window.removeEventListener("pointerup", handlePointerUp);
	});
</script>

<div class="relative flex h-full min-h-0 flex-col md:min-h-screen">
	<div
		class="sticky top-0 flex flex-none touch-none items-center justify-between px-1.5 py-3.5 max-sm:pt-0"
	>
		<a
			class="flex select-none items-center rounded-xl text-lg font-semibold"
			href="{publicConfig.PUBLIC_ORIGIN}{base}/"
		>
			<Logo classNames="dark:invert mr-[2px]" />
			{publicConfig.PUBLIC_APP_NAME}
		</a>
		<a
			href={`${base}/`}
			onclick={handleNewChatClick}
			class="flex rounded-lg border bg-white px-2 py-0.5 text-center shadow-sm hover:shadow-none dark:border-gray-600 dark:bg-gray-700 sm:text-smd"
			title="Ctrl/Cmd + Shift + O"
		>
			שיחה חדשה
		</a>
	</div>

	<div
		class="scrollbar-custom flex min-h-0 flex-1 touch-pan-y flex-col gap-1 overflow-y-auto rounded-r-xl border border-l-0 border-gray-100 from-gray-50 px-3 pb-3 pt-2 text-[.9rem] dark:border-transparent dark:from-gray-800/30 max-sm:bg-gradient-to-t md:bg-gradient-to-l"
	>
		<div class="flex flex-col gap-0.5">
			{#each Object.entries(groupedConversations) as [group, convs]}
				{#if convs.length}
					<h4 class="mb-1.5 mt-4 pl-0.5 text-sm text-gray-400 first:mt-0 dark:text-gray-500">
						{titles[group]}
					</h4>
					{#each convs as conv}
						<NavConversationItem {conv} {oneditConversationTitle} {ondeleteConversation} />
					{/each}
				{/if}
			{/each}
		</div>
		{#if hasMore}
			<InfiniteScroll onvisible={handleVisible} />
		{/if}
	</div>

	<div
		class="mt-auto flex touch-none flex-col gap-1 rounded-r-xl border border-l-0 border-gray-100 p-3 text-sm dark:border-transparent md:bg-gradient-to-l md:from-gray-50 md:dark:from-gray-800/30"
	>
		{#if user?.username || user?.email}
			<div
				class="group flex items-center gap-1.5 rounded-lg pl-2.5 pr-2 hover:bg-gray-100 dark:hover:bg-gray-700"
			>
				<span
					class="flex h-9 flex-none shrink items-center gap-1.5 truncate pr-2 text-gray-500 dark:text-gray-400"
					>{user?.username || user?.email}</span
				>

				<img
					src="https://huggingface.co/api/users/{user.username}/avatar?redirect=true"
					class="ml-auto size-4 rounded-full border bg-gray-500 dark:border-white/40"
					alt=""
				/>
			</div>
		{/if}
		<a
			href="{base}/models"
			class="flex h-9 flex-none items-center gap-1.5 rounded-lg pl-2.5 pr-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
			onclick={handleNavItemClick}
		>
			מודלים
			<span
				class="ml-auto rounded-md bg-gray-500/5 px-1.5 py-0.5 text-xs text-gray-400 dark:bg-gray-500/20 dark:text-gray-400"
				>{nModels}</span
			>
		</a>

		{#if user?.username || user?.email}
			<button
				onclick={() => (showMcpModal = true)}
				class="flex h-9 flex-none items-center gap-1.5 rounded-lg pl-2.5 pr-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
			>
				שרתי MCP
				{#if $enabledServersCount > 0}
					<span
						class="ml-auto rounded-md bg-blue-600/10 px-1.5 py-0.5 text-xs text-blue-600 dark:bg-blue-600/20 dark:text-blue-400"
					>
						{$enabledServersCount}
					</span>
				{/if}
			</button>
		{/if}

		<span class="flex gap-1">
			<a
				href="{base}/settings/application"
				class="flex h-9 flex-none flex-grow items-center gap-1.5 rounded-lg pl-2.5 pr-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
				onclick={handleNavItemClick}
			>
				הגדרות
			</a>
			<button
				onclick={() => {
					switchTheme();
				}}
				aria-label="Toggle theme"
				class="flex size-9 min-w-[1.5em] flex-none items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
			>
				{#if browser}
					{#if isDark}
						<IconSun />
					{:else}
						<IconMoon />
					{/if}
				{/if}
			</button>
		</span>
	</div>

	<button
		type="button"
		class="group absolute inset-y-0 right-0 hidden w-[10px] cursor-col-resize bg-transparent p-0 md:block"
		onpointerdown={handlePointerDown}
		onkeydown={handleResizeKeydown}
		aria-label="Resize sidebar"
	>
		<span
			class="pointer-events-none mx-auto block h-full w-px bg-gray-200 opacity-0 transition-colors duration-150 group-hover:bg-gray-300 group-hover:opacity-100 dark:bg-gray-700 dark:group-hover:bg-gray-500"
		></span>
	</button>

	{#if showMcpModal}
		<MCPServerManager onclose={() => (showMcpModal = false)} />
	{/if}
</div>

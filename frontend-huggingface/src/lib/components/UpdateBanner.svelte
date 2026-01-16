<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { base } from "$app/paths";
	import { browser } from "$app/environment";
	import { env as publicEnv } from "$env/dynamic/public";
	import AnnouncementBanner from "$lib/components/AnnouncementBanner.svelte";
	import { apiRequest } from "$lib/utils/apiClient";

	let isVisible = $state(false);
	let serverVersion = $state<string | null>(null);
	let lastError = $state<string | null>(null);
	let timer: ReturnType<typeof setInterval> | null = null;

	function toKeyPart(s: string | undefined): string {
		return (s || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
	}

	const appLabel = toKeyPart(publicEnv.PUBLIC_APP_ASSETS || publicEnv.PUBLIC_APP_NAME);
	const baseLabel = toKeyPart(typeof base === "string" ? base : "");
	const KEY_PREFIX = appLabel || baseLabel || "app";
	const STORAGE_KEY = `${KEY_PREFIX}:app:version:last-seen`;

	type VersionResponse = {
		success: boolean;
		version: string | null;
	};

	async function checkVersion() {
		try {
			const data = await apiRequest<VersionResponse>(`${base}/api/system/version`, {
				retries: 0,
				timeoutMs: 4000,
			});
			const nextVersion = typeof data.version === "string" ? data.version : null;
			serverVersion = nextVersion;
			lastError = null;

			if (!browser || !nextVersion) return;
			const prev = localStorage.getItem(STORAGE_KEY);

			if (prev && prev !== nextVersion) {
				isVisible = true;
			} else if (!prev) {
				localStorage.setItem(STORAGE_KEY, nextVersion);
			}
		} catch (err) {
			lastError = err instanceof Error ? err.message : "Failed to check version";
		}
	}

	function reload() {
		if (!browser) return;
		if (serverVersion) localStorage.setItem(STORAGE_KEY, serverVersion);
		location.reload();
	}

	onMount(() => {
		checkVersion();
		timer = setInterval(checkVersion, 5 * 60 * 1000);
		return () => {
			if (timer) clearInterval(timer);
		};
	});

	onDestroy(() => {
		if (timer) clearInterval(timer);
	});
</script>

{#if isVisible}
	<div class="absolute left-1/2 top-3 z-50 -translate-x-1/2">
		<AnnouncementBanner title="קיים עדכון חדש">
			<button
				type="button"
				onclick={reload}
				class="rounded-lg bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
			>
				רענן
			</button>
		</AnnouncementBanner>
	</div>
{/if}
<!-- Note: lastError is intentionally not rendered to avoid disrupting grid layout -->

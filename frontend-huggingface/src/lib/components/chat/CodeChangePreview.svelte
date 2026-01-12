<script lang="ts">
	import { base } from "$app/paths";
	import { extractPatchesFromText, isRiskyPath, splitPatchByFile } from "$lib/utils/codeChanges";

	interface Props {
		content: string;
	}

	let { content }: Props = $props();

	let expanded = $state(false);
	let applying = $state(false);
	let applyDryRun = $state(true);
	let applyError = $state<string | null>(null);
	let applyResult = $state<Record<string, unknown> | null>(null);

	const extracted = $derived(extractPatchesFromText(content));
	const patches = $derived(extracted.patches);
	const beginPatch = $derived(patches.find((p) => p.kind === "begin_patch") ?? null);
	const applyFiles = $derived(beginPatch ? splitPatchByFile(beginPatch.patchText) : []);
	const files = $derived(patches.flatMap((p) => splitPatchByFile(p.patchText)));
	const hasRisky = $derived(files.some((f) => isRiskyPath(f.path)));
	let selectedFiles = $state<Record<string, boolean>>({});

	$effect(() => {
		const next: Record<string, boolean> = {};
		for (const f of applyFiles) next[f.path] = selectedFiles[f.path] ?? true;
		selectedFiles = next;
	});

	async function copyAll() {
		try {
			const text = patches.map((p) => p.patchText).join("\n\n");
			await navigator.clipboard.writeText(text);
		} catch (err) {
			console.debug("copy patch failed", { err: String(err) });
		}
	}

	function downloadAll() {
		try {
			const text = patches.map((p) => p.patchText).join("\n\n");
			const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "changes.patch";
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		} catch (err) {
			console.debug("download patch failed", { err: String(err) });
		}
	}

	async function runApply(dryRun: boolean) {
		if (!beginPatch) return;
		applyError = null;
		applyResult = null;
		applying = true;
		try {
			const onlyFiles = Object.entries(selectedFiles)
				.filter(([, on]) => on)
				.map(([p]) => p);
			const res = await fetch(`${base}/api/dev/patch`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					patchText: beginPatch.patchText,
					dryRun,
					onlyFiles,
				}),
			});
			const data = await res.json().catch(() => null);
			if (!res.ok) {
				throw new Error((data && (data.error || data.message)) || `Apply failed (${res.status})`);
			}
			applyResult = data;
		} catch (err) {
			applyError = err instanceof Error ? err.message : String(err);
		} finally {
			applying = false;
		}
	}
</script>

{#if patches.length > 0}
	<div
		class="my-3 rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
	>
		<button
			type="button"
			class="flex w-full items-center gap-2 px-3 py-2.5 text-sm"
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
		>
			<span class="font-medium text-gray-800 dark:text-gray-100">שינויים בקוד</span>
			<span class="text-xs text-gray-500 dark:text-gray-400">
				({files.length} קבצים)
			</span>
			{#if hasRisky}
				<span
					class="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
				>
					רגיש
				</span>
			{/if}
			<span class="mr-auto text-gray-400">{expanded ? "▾" : "▸"}</span>
		</button>

		{#if expanded}
			<div class="border-t border-gray-200 px-3 py-2 dark:border-gray-700">
				<div class="mb-2 flex flex-wrap gap-2">
					<button
						type="button"
						class="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
						onclick={copyAll}
					>
						העתק Patch
					</button>
					<button
						type="button"
						class="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
						onclick={downloadAll}
					>
						הורד Patch
					</button>
					{#if beginPatch}
						<label class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
							<input type="checkbox" bind:checked={applyDryRun} />
							Dry run
						</label>
						<button
							type="button"
							class="rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-60"
							disabled={applying}
							onclick={() => runApply(applyDryRun)}
						>
							{applying ? "מריץ..." : "החל Patch"}
						</button>
					{/if}
				</div>

				{#if beginPatch}
					<div class="mb-2 text-xs text-gray-500 dark:text-gray-400">
						החלה אוטומטית נתמכת רק עבור Trae Begin Patch.
					</div>
				{/if}

				{#if applyError}
					<div
						class="mb-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
					>
						{applyError}
					</div>
				{/if}

				{#if applyResult}
					<pre class="mb-2 overflow-auto rounded-md bg-gray-50 p-2 text-xs dark:bg-gray-900"><code
							>{JSON.stringify(applyResult, null, 2)}</code
						></pre>
				{/if}

				<div class="space-y-2">
					{#each beginPatch ? applyFiles : files as file (file.path)}
						<div class="rounded-lg border border-gray-200 dark:border-gray-700">
							<div class="flex items-center gap-2 px-2 py-1.5 text-xs">
								{#if beginPatch}
									<input
										type="checkbox"
										checked={selectedFiles[file.path] ?? true}
										onchange={(e) =>
											(selectedFiles = {
												...selectedFiles,
												[file.path]: (e.target as HTMLInputElement).checked,
											})}
									/>
								{/if}
								<span class="font-mono text-gray-700 dark:text-gray-200">{file.path}</span>
								{#if isRiskyPath(file.path)}
									<span
										class="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
									>
										רגיש
									</span>
								{/if}
							</div>
							<pre class="overflow-auto bg-gray-50 p-2 text-xs leading-5 dark:bg-gray-900"><code
									>{file.content}</code
								></pre>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}

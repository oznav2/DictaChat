<script lang="ts">
	import { onMount } from "svelte";
	import { browser } from "$app/environment";
	import { base } from "$app/paths";
	import Modal from "$lib/components/Modal.svelte";
	import { memoryUi } from "$lib/stores/memoryUi";

	interface Preset {
		id: string;
		name: string;
		description?: string;
	}

	interface PersonalityData {
		identity: {
			name: string;
			role: string;
			background: string;
		};
		communication: {
			tone: string;
			verbosity: string;
			formality: string;
		};
		response_behavior: {
			use_analogies: boolean;
			use_examples: boolean;
			use_humor: boolean;
		};
		memory_usage: {
			priority: string;
			pattern_trust: string;
		};
		custom_instructions: string;
	}

	let activeMode = $state<"quick" | "advanced">("quick");
	let presets = $state<Preset[]>([]);
	let selectedPresetId = $state<string>("default");
	let isLoading = $state(false);
	let isSaving = $state(false);
	let hasChanges = $state(false);
	let showHelp = $state(false);
	let saveSuccess = $state(false);
	let errorMessage = $state<string | null>(null);

	// Quick settings data
	let data = $state<PersonalityData>({
		identity: { name: "", role: "", background: "" },
		communication: { tone: "friendly", verbosity: "balanced", formality: "casual" },
		response_behavior: { use_analogies: true, use_examples: true, use_humor: false },
		memory_usage: { priority: "balanced", pattern_trust: "medium" },
		custom_instructions: "",
	});

	// Original data for reset
	let originalData = $state<PersonalityData | null>(null);

	// Advanced mode YAML
	let yamlContent = $state("");
	let yamlError = $state<string | null>(null);

	const toneOptions = [
		{ value: "friendly", label: "ידידותי" },
		{ value: "professional", label: "מקצועי" },
		{ value: "casual", label: "קז'ואל" },
		{ value: "formal", label: "רשמי" },
	];

	const verbosityOptions = [
		{ value: "concise", label: "תמציתי" },
		{ value: "balanced", label: "מאוזן" },
		{ value: "detailed", label: "מפורט" },
	];

	const formalityOptions = [
		{ value: "casual", label: "קז'ואל" },
		{ value: "neutral", label: "ניטרלי" },
		{ value: "formal", label: "רשמי" },
	];

	const priorityOptions = [
		{ value: "recent", label: "עדכני" },
		{ value: "balanced", label: "מאוזן" },
		{ value: "patterns", label: "דפוסים" },
	];

	const trustOptions = [
		{ value: "low", label: "נמוך" },
		{ value: "medium", label: "בינוני" },
		{ value: "high", label: "גבוה" },
	];

	function handleClose() {
		memoryUi.closePersonality();
	}

	function markChanged() {
		hasChanges = true;
		saveSuccess = false;
	}

	async function loadPresets() {
		try {
			const response = await fetch(`${base}/api/memory/personality/presets`);
			if (!response.ok) throw new Error(`Failed to load presets: ${response.status}`);
			const data = await response.json();
			presets = data.presets ?? [];
		} catch (err) {
			console.error("Failed to load presets:", err);
		}
	}

	async function loadCurrentPersonality() {
		isLoading = true;
		try {
			const response = await fetch(`${base}/api/memory/personality`);
			if (!response.ok) throw new Error(`Failed to load personality: ${response.status}`);
			const respData = await response.json();
			selectedPresetId = respData.template_id ?? "default";
			yamlContent = respData.content ?? "";

			// Parse YAML to populate quick settings
			parseYamlToData(respData.content ?? "");
			originalData = JSON.parse(JSON.stringify(data));
			hasChanges = false;
		} catch (err) {
			console.error("Failed to load current personality:", err);
		} finally {
			isLoading = false;
		}
	}

	async function loadPreset(presetId: string) {
		isLoading = true;
		try {
			const response = await fetch(`${base}/api/memory/personality/presets?id=${presetId}`);
			if (!response.ok) throw new Error(`Failed to load preset: ${response.status}`);
			const respData = await response.json();

			yamlContent = respData.content ?? "";
			parseYamlToData(respData.content ?? "");
			selectedPresetId = presetId;
			markChanged();
		} catch (err) {
			console.error("Failed to load preset:", err);
		} finally {
			isLoading = false;
		}
	}

	function parseYamlToData(yaml: string) {
		// Simple regex-based parsing for known fields
		const getValue = (key: string): string => {
			const match = yaml.match(new RegExp(`${key}:\\s*["']?([^"'\\n]+)["']?`));
			return match?.[1]?.trim() ?? "";
		};

		const getBool = (key: string): boolean => {
			const val = getValue(key).toLowerCase();
			return val === "true" || val === "yes";
		};

		data = {
			identity: {
				name: getValue("name") || "Assistant",
				role: getValue("role") || "",
				background: getValue("background") || "",
			},
			communication: {
				tone: getValue("tone") || "friendly",
				verbosity: getValue("verbosity") || "balanced",
				formality: getValue("formality") || "casual",
			},
			response_behavior: {
				use_analogies: getBool("use_analogies"),
				use_examples: getBool("use_examples"),
				use_humor: getBool("use_humor"),
			},
			memory_usage: {
				priority: getValue("priority") || "balanced",
				pattern_trust: getValue("pattern_trust") || "medium",
			},
			custom_instructions: getValue("custom_instructions") || "",
		};
	}

	function dataToYaml(): string {
		return `# Personality Configuration
identity:
  name: "${data.identity.name}"
  role: "${data.identity.role}"
  background: "${data.identity.background}"

communication:
  tone: "${data.communication.tone}"
  verbosity: "${data.communication.verbosity}"
  formality: "${data.communication.formality}"

response_behavior:
  use_analogies: ${data.response_behavior.use_analogies}
  use_examples: ${data.response_behavior.use_examples}
  use_humor: ${data.response_behavior.use_humor}

memory_usage:
  priority: "${data.memory_usage.priority}"
  pattern_trust: "${data.memory_usage.pattern_trust}"

custom_instructions: "${data.custom_instructions}"
`;
	}

	function validateYaml(yaml: string): boolean {
		// Basic YAML validation
		try {
			// Check for required fields
			if (!yaml.includes("identity:") || !yaml.includes("name:")) {
				yamlError = "Missing required field: identity.name";
				return false;
			}
			yamlError = null;
			return true;
		} catch {
			yamlError = "Invalid YAML format";
			return false;
		}
	}

	async function handleSave() {
		errorMessage = null;
		const content = activeMode === "quick" ? dataToYaml() : yamlContent;

		if (!validateYaml(content)) {
			errorMessage = yamlError;
			return;
		}

		isSaving = true;
		try {
			// Save the custom content
			const saveResponse = await fetch(`${base}/api/memory/personality`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "custom", content }),
			});
			if (!saveResponse.ok) throw new Error(`Save failed: ${saveResponse.status}`);

			originalData = JSON.parse(JSON.stringify(data));
			hasChanges = false;
			saveSuccess = true;

			// Dispatch event for sidebar name update
			if (browser) {
				window.dispatchEvent(
					new CustomEvent("personalityUpdated", { detail: { name: data.identity.name } })
				);
			}

			// Clear success after 2s
			setTimeout(() => {
				saveSuccess = false;
			}, 2000);
		} catch (err) {
			console.error("Failed to save personality:", err);
			errorMessage = "Failed to save personality";
		} finally {
			isSaving = false;
		}
	}

	function handleReset() {
		if (originalData) {
			data = JSON.parse(JSON.stringify(originalData));
			yamlContent = dataToYaml();
			hasChanges = false;
		}
	}

	function handleDownload() {
		const content = activeMode === "quick" ? dataToYaml() : yamlContent;
		const blob = new Blob([content], { type: "text/yaml" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "personality.yaml";
		a.click();
		URL.revokeObjectURL(url);
	}

	onMount(() => {
		loadPresets();
		loadCurrentPersonality();
	});
</script>

<Modal width="max-w-2xl" closeButton onclose={handleClose} dir="rtl">
	<div class="p-6" dir="rtl">
		<!-- Header -->
		<div class="mb-4">
			<h2 class="text-xl font-semibold text-gray-800 dark:text-gray-100">אישיות וזהות</h2>
			<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
				התאם את אופי התגובות והסגנון של העוזר
			</p>
		</div>

		<!-- Mode Tabs -->
		<div class="mb-4 flex gap-2">
			<button
				type="button"
				onclick={() => (activeMode = "quick")}
				class={[
					"rounded-lg px-4 py-2 text-sm transition-colors",
					activeMode === "quick"
						? "bg-blue-500 text-white"
						: "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600",
				]}
			>
				הגדרות מהירות
			</button>
			<button
				type="button"
				onclick={() => {
					activeMode = "advanced";
					yamlContent = dataToYaml();
				}}
				class={[
					"rounded-lg px-4 py-2 text-sm transition-colors",
					activeMode === "advanced"
						? "bg-blue-500 text-white"
						: "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600",
				]}
			>
				מתקדם (YAML)
			</button>

			<!-- Preset Selector -->
			<select
				bind:value={selectedPresetId}
				onchange={() => loadPreset(selectedPresetId)}
				class="mr-auto rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
			>
				{#each presets as preset}
					<option value={preset.id}>{preset.name}</option>
				{/each}
			</select>
		</div>

		{#if isLoading}
			<div class="flex items-center justify-center py-12">
				<div
					class="size-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500"
				></div>
			</div>
		{:else if activeMode === "quick"}
			<!-- Quick Settings Mode -->
			<div class="space-y-6">
				<!-- Identity Section -->
				<div>
					<h3 class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">זהות</h3>
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class="mb-1 block text-xs text-gray-500 dark:text-gray-400">
								שם
								<input
									type="text"
									bind:value={data.identity.name}
									oninput={markChanged}
									class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
								/>
							</label>
						</div>
						<div>
							<label class="mb-1 block text-xs text-gray-500 dark:text-gray-400">
								תפקיד
								<input
									type="text"
									bind:value={data.identity.role}
									oninput={markChanged}
									class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
								/>
							</label>
						</div>
						<div class="sm:col-span-2">
							<label class="mb-1 block text-xs text-gray-500 dark:text-gray-400">
								רקע
								<textarea
									bind:value={data.identity.background}
									oninput={markChanged}
									rows="2"
									class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
								></textarea>
							</label>
						</div>
					</div>
				</div>

				<!-- Communication Section -->
				<div>
					<h3 class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">תקשורת</h3>
					<div class="grid gap-4 sm:grid-cols-3">
						<div>
							<label class="mb-1 block text-xs text-gray-500 dark:text-gray-400">
								טון
								<select
									bind:value={data.communication.tone}
									onchange={markChanged}
									class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
								>
									{#each toneOptions as opt}
										<option value={opt.value}>{opt.label}</option>
									{/each}
								</select>
							</label>
						</div>
						<div>
							<label class="mb-1 block text-xs text-gray-500 dark:text-gray-400">
								פירוט
								<select
									bind:value={data.communication.verbosity}
									onchange={markChanged}
									class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
								>
									{#each verbosityOptions as opt}
										<option value={opt.value}>{opt.label}</option>
									{/each}
								</select>
							</label>
						</div>
						<div>
							<label class="mb-1 block text-xs text-gray-500 dark:text-gray-400">
								רשמיות
								<select
									bind:value={data.communication.formality}
									onchange={markChanged}
									class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
								>
									{#each formalityOptions as opt}
										<option value={opt.value}>{opt.label}</option>
									{/each}
								</select>
							</label>
						</div>
					</div>
				</div>

				<!-- Response Behavior Section -->
				<div>
					<h3 class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">התנהגות תגובה</h3>
					<div class="flex flex-wrap gap-4">
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={data.response_behavior.use_analogies}
								onchange={markChanged}
								class="size-4 rounded border-gray-300 dark:border-gray-600"
							/>
							<span class="text-sm text-gray-700 dark:text-gray-200">אנלוגיות</span>
						</label>
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={data.response_behavior.use_examples}
								onchange={markChanged}
								class="size-4 rounded border-gray-300 dark:border-gray-600"
							/>
							<span class="text-sm text-gray-700 dark:text-gray-200">דוגמאות</span>
						</label>
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								bind:checked={data.response_behavior.use_humor}
								onchange={markChanged}
								class="size-4 rounded border-gray-300 dark:border-gray-600"
							/>
							<span class="text-sm text-gray-700 dark:text-gray-200">הומור</span>
						</label>
					</div>
				</div>

				<!-- Memory Usage Section -->
				<div>
					<h3 class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">שימוש בזיכרון</h3>
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class="mb-1 block text-xs text-gray-500 dark:text-gray-400">
								עדיפות
								<select
									bind:value={data.memory_usage.priority}
									onchange={markChanged}
									class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
								>
									{#each priorityOptions as opt}
										<option value={opt.value}>{opt.label}</option>
									{/each}
								</select>
							</label>
						</div>
						<div>
							<label class="mb-1 block text-xs text-gray-500 dark:text-gray-400">
								אמון בדפוסים
								<select
									bind:value={data.memory_usage.pattern_trust}
									onchange={markChanged}
									class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
								>
									{#each trustOptions as opt}
										<option value={opt.value}>{opt.label}</option>
									{/each}
								</select>
							</label>
						</div>
					</div>
				</div>

				<!-- Custom Instructions -->
				<div>
					<h3 class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">הנחיות מותאמות</h3>
					<textarea
						bind:value={data.custom_instructions}
						oninput={markChanged}
						rows="3"
						placeholder="הוסף הנחיות מיוחדות..."
						class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
					></textarea>
				</div>
			</div>
		{:else}
			<!-- Advanced YAML Mode -->
			<div>
				<textarea
					bind:value={yamlContent}
					oninput={() => {
						markChanged();
						validateYaml(yamlContent);
					}}
					rows="20"
					class="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-sm outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
					spellcheck="false"
				></textarea>
				{#if yamlError}
					<p class="mt-2 text-sm text-red-500">{yamlError}</p>
				{/if}
			</div>
		{/if}

		<!-- Help Panel -->
		{#if showHelp}
			<div
				class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/30"
			>
				<h4 class="mb-2 text-sm font-medium text-blue-800 dark:text-blue-200">איך זה עובד?</h4>
				<ul class="space-y-1 text-xs text-blue-700 dark:text-blue-300">
					<li>• הגדרות האישיות משפיעות על אופן התגובות של העוזר</li>
					<li>• שינויים נכנסים לתוקף מיד לאחר שמירה</li>
					<li>• ניתן לחזור להגדרות ברירת המחדל בכל עת</li>
					<li>• הגדרות זיכרון קובעות כמה להסתמך על מידע קודם</li>
				</ul>
			</div>
		{/if}

		<!-- Error Message -->
		{#if errorMessage}
			<div
				class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300"
			>
				{errorMessage}
			</div>
		{/if}

		<!-- Footer Actions -->
		<div class="mt-6 flex items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
			{#if hasChanges}
				<span class="text-xs text-amber-600 dark:text-amber-400">יש שינויים שלא נשמרו</span>
			{/if}
			{#if saveSuccess}
				<span class="text-xs text-green-600 dark:text-green-400">נשמר בהצלחה!</span>
			{/if}

			<div class="mr-auto flex gap-2">
				<button
					type="button"
					onclick={() => (showHelp = !showHelp)}
					class="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
				>
					עזרה
				</button>
				<button
					type="button"
					onclick={handleDownload}
					class="rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
				>
					הורד YAML
				</button>
				{#if hasChanges}
					<button
						type="button"
						onclick={handleReset}
						class="rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
					>
						איפוס
					</button>
				{/if}
				<button
					type="button"
					onclick={handleSave}
					disabled={isSaving || !hasChanges}
					class="rounded-lg bg-blue-500 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isSaving ? "שומר..." : "שמור והפעל"}
				</button>
			</div>
		</div>
	</div>
</Modal>

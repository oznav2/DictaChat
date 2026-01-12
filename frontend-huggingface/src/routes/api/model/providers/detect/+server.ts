import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { authCondition } from "$lib/server/auth";
import { collections } from "$lib/server/database";
import { DEFAULT_SETTINGS } from "$lib/types/Settings";
import { defaultModel, models } from "$lib/server/models";

type ProviderStatus = {
	provider: string;
	base_url_origin: string | null;
	configured: boolean;
	ok: boolean;
	latency_ms: number | null;
	error: string | null;
};

function safeOrigin(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
}

async function probeOpenAI(baseURL: string, apiKey: string | null): Promise<Omit<ProviderStatus, "provider">> {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 2500);
	const start = Date.now();

	try {
		const headers: Record<string, string> = {};
		if (apiKey && apiKey !== "sk-") {
			headers.Authorization = `Bearer ${apiKey}`;
		}

		const res = await fetch(`${baseURL.replace(/\/$/, "")}/models`, {
			method: "GET",
			headers,
			signal: controller.signal,
		});
		const latencyMs = Date.now() - start;
		clearTimeout(timeoutId);

		if (res.ok) {
			return { base_url_origin: safeOrigin(baseURL), configured: true, ok: true, latency_ms: latencyMs, error: null };
		}

		if (res.status === 401 || res.status === 403) {
			return {
				base_url_origin: safeOrigin(baseURL),
				configured: true,
				ok: false,
				latency_ms: latencyMs,
				error: "unauthorized",
			};
		}

		return {
			base_url_origin: safeOrigin(baseURL),
			configured: true,
			ok: false,
			latency_ms: latencyMs,
			error: `http_${res.status}`,
		};
	} catch (err) {
		clearTimeout(timeoutId);
		const latencyMs = Date.now() - start;
		const message = err instanceof Error ? err.message : String(err);
		const error =
			message.toLowerCase().includes("aborted") || message.toLowerCase().includes("timeout")
				? "timeout"
				: "network_error";
		return { base_url_origin: safeOrigin(baseURL), configured: Boolean(baseURL), ok: false, latency_ms: latencyMs, error };
	}
}

export const GET: RequestHandler = async ({ locals }) => {
	const settings = await collections.settings.findOne(authCondition(locals));
	const activeModelId = settings?.activeModel ?? DEFAULT_SETTINGS.activeModel;
	const model = models.find((m) => m.id === activeModelId) ?? defaultModel;

	const endpoint = model.endpoints?.[0] as
		| { type: "openai"; baseURL?: string; apiKey?: string }
		| undefined;

	const baseURL = endpoint?.baseURL ?? null;
	const apiKey = endpoint?.apiKey ?? null;

	const providerLabel =
		safeOrigin(baseURL) === "https://router.huggingface.co" ? "hf_router" : "openai_compatible";

	const openai = baseURL
		? await probeOpenAI(baseURL, apiKey && apiKey !== "sk-" ? apiKey : null)
		: { base_url_origin: null, configured: false, ok: false, latency_ms: null, error: "missing_base_url" as const };

	const providers: ProviderStatus[] = [
		{
			provider: providerLabel,
			...openai,
		},
	];

	return json({
		as_of: new Date().toISOString(),
		current_model_id: model.id,
		providers,
	});
};


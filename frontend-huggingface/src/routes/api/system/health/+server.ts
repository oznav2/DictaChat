import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getMemoryEnvConfig } from "$lib/server/memory";

async function fetchOk(url: string, timeoutMs: number): Promise<boolean> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, { signal: controller.signal });
		return res.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
}

export const GET: RequestHandler = async () => {
	const envConfig = getMemoryEnvConfig();
	const qdrantBase = `${envConfig.qdrantHttps ? "https" : "http"}://${envConfig.qdrantHost}:${envConfig.qdrantPort}`;
	const qdrantOk = await fetchOk(`${qdrantBase}/healthz`, 1000);

	const warnings: string[] = [];
	if (!qdrantOk) warnings.push("qdrant_unavailable");

	return json({
		success: true,
		health: {
			ok: warnings.length === 0,
			warnings,
			services: {
				qdrant: { ok: qdrantOk, base_url: qdrantBase },
			},
		},
	});
};

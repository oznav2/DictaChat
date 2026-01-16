import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { readFile } from "node:fs/promises";
import path from "node:path";

type ScannedServer = {
	name: string;
	url: string;
	headers?: Record<string, string>;
	env?: Record<string, string>;
};

async function readJsonFile(filePath: string): Promise<any | null> {
	try {
		const raw = await readFile(filePath, "utf-8");
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function extractServersFromConfig(data: any): ScannedServer[] {
	const servers: ScannedServer[] = [];

	if (!data || typeof data !== "object") return servers;

	const listLike = data.servers ?? data.mcp_servers ?? data.mcpServers;
	if (Array.isArray(listLike)) {
		for (const s of listLike) {
			if (!s || typeof s !== "object") continue;
			const url =
				typeof s.url === "string" ? s.url : typeof s.endpoint === "string" ? s.endpoint : null;
			const name = typeof s.name === "string" ? s.name : null;
			if (!url || !name) continue;
			servers.push({ name, url, headers: s.headers, env: s.env });
		}
	}

	const mapLike = data.mcpServers && typeof data.mcpServers === "object" ? data.mcpServers : null;
	if (mapLike && !Array.isArray(mapLike)) {
		for (const [name, s] of Object.entries<any>(mapLike)) {
			if (!s || typeof s !== "object") continue;
			const url =
				typeof s.url === "string" ? s.url : typeof s.endpoint === "string" ? s.endpoint : null;
			if (!url) continue;
			servers.push({ name: String(name), url, headers: s.headers, env: s.env });
		}
	}

	return servers;
}

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.isAdmin) {
		return json(
			{
				success: false,
				error: "Admin only",
			},
			{ status: 403 }
		);
	}

	const home = process.env.HOME || "";
	const candidates = [
		home ? path.join(home, ".config", "Claude", "claude_desktop_config.json") : null,
		home ? path.join(home, ".config", "claude_desktop_config.json") : null,
		home ? path.join(home, ".config", "cursor_mcp_settings.json") : null,
		home ? path.join(home, ".config", "vscode_mcp.json") : null,
		home ? path.join(home, ".config", "mcp.json") : null,
		path.join(process.cwd(), "mcp.json"),
	].filter(Boolean) as string[];

	const found: Array<{ path: string; count: number }> = [];
	const allServers: ScannedServer[] = [];

	for (const filePath of candidates) {
		const data = await readJsonFile(filePath);
		if (!data) continue;
		const servers = extractServersFromConfig(data).filter((s) => /^https?:\/\//.test(s.url));
		if (servers.length === 0) continue;
		found.push({ path: filePath, count: servers.length });
		allServers.push(...servers);
	}

	return json({
		success: true,
		sources: found,
		servers: allServers,
	});
};

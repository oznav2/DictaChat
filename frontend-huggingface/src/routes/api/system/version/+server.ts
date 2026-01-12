import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { readFile } from "node:fs/promises";

async function readPackageVersion(): Promise<string | null> {
	try {
		const pkgUrl = new URL("../../../../../package.json", import.meta.url);
		const raw = await readFile(pkgUrl, "utf-8");
		const parsed = JSON.parse(raw);
		return typeof parsed?.version === "string" ? parsed.version : null;
	} catch {
		return null;
	}
}

export const GET: RequestHandler = async () => {
	const version = await readPackageVersion();
	return json({
		success: true,
		version,
		build: {
			git_sha: process.env.GIT_SHA ?? null,
			node_env: process.env.NODE_ENV ?? null,
		},
	});
};

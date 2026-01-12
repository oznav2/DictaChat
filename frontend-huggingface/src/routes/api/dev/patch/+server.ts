import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs/promises";
import { applyTraePatch } from "$lib/server/patch/traePatch";

const bodySchema = z.object({
	patchText: z.string().min(1),
	dryRun: z.boolean().optional(),
	onlyFiles: z.array(z.string()).optional(),
});

async function detectRepoRoot(): Promise<string> {
	const cwd = process.cwd();
	const parent = path.resolve(cwd, "..");
	try {
		await fs.access(path.join(parent, "STATUS.md"));
		return parent;
	} catch (err) {
		return cwd;
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.isAdmin) {
		return json({ success: false, error: "Not admin" }, { status: 403 });
	}

	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json({ success: false, error: "Invalid body" }, { status: 400 });
	}

	const repoRoot = await detectRepoRoot();
	const dryRun = parsed.data.dryRun ?? true;

	const result = await applyTraePatch({
		rootDir: repoRoot,
		patchText: parsed.data.patchText,
		dryRun,
		onlyFiles: parsed.data.onlyFiles ?? null,
	});

	return json({
		success: true,
		repoRoot,
		dryRun,
		...result,
	});
};

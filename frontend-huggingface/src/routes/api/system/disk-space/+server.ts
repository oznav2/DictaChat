import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { statfs } from "node:fs/promises";

export const GET: RequestHandler = async () => {
	try {
		const stats = await statfs(process.cwd());
		const totalBytes = stats.bsize * stats.blocks;
		const freeBytes = stats.bsize * stats.bavail;
		const usedBytes = Math.max(0, totalBytes - freeBytes);
		const usedRatio = totalBytes > 0 ? usedBytes / totalBytes : null;

		return json({
			success: true,
			disk: {
				path: process.cwd(),
				total_bytes: totalBytes,
				free_bytes: freeBytes,
				used_bytes: usedBytes,
				used_ratio: usedRatio,
			},
		});
	} catch (err) {
		console.error("[API] Failed to get disk space:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to get disk space" },
			{ status: 500 }
		);
	}
};

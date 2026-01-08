import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { PersonalityLoader } from "$lib/server/memory/personality";

// GET /api/memory/personality/presets - Get available presets
export const GET: RequestHandler = async () => {
	try {
		const loader = PersonalityLoader.getInstance();
		const presets = loader.getPresets();

		return json({
			success: true,
			presets,
		});
	} catch (err) {
		console.error("[API] Failed to get presets:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to get presets" },
			{ status: 500 }
		);
	}
};

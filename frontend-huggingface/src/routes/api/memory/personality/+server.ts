import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { PersonalityLoader } from "$lib/server/memory/personality";
import { collections } from "$lib/server/database";

// GET /api/memory/personality - Get current personality settings
export const GET: RequestHandler = async ({ locals }) => {
	const userId = locals.user?.id;

	// Return default personality for unauthenticated users
	if (!userId) {
		return json({
			success: true,
			personality: {
				name: "default",
				content: "",
				isDefault: true,
			},
		});
	}

	try {
		const loader = PersonalityLoader.getInstance();
		const personality = await loader.getPersonality(userId);

		return json({
			success: true,
			personality,
		});
	} catch (err) {
		console.error("[API] Failed to get personality:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to get personality" },
			{ status: 500 }
		);
	}
};

// POST /api/memory/personality - Save personality settings
export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = locals.user?.id;
	if (!userId) {
		return error(401, "Authentication required");
	}

	try {
		const { yaml_content, preset_name, preset_description } = await request.json();

		if (!yaml_content || typeof yaml_content !== "string") {
			return error(400, "yaml_content is required");
		}

		// Validate YAML structure
		const loader = PersonalityLoader.getInstance();
		const validation = loader.validateYaml(yaml_content);
		if (!validation.valid) {
			return json({ success: false, error: validation.error }, { status: 400 });
		}

		// Save to database
		await collections.userPersonality.updateOne(
			{ userId },
			{
				$set: {
					userId,
					yaml_content,
					preset_name: preset_name || null,
					preset_description: preset_description || null,
					updatedAt: new Date(),
				},
				$setOnInsert: {
					createdAt: new Date(),
				},
			},
			{ upsert: true }
		);

		// Reload personality cache
		await loader.reloadPersonality(userId);

		return json({
			success: true,
			message: "Personality saved successfully",
		});
	} catch (err) {
		console.error("[API] Failed to save personality:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to save personality" },
			{ status: 500 }
		);
	}
};

// Note: Presets endpoint moved to /api/memory/personality/presets/+server.ts

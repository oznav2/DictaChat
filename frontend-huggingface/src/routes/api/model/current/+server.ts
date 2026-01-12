import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { authCondition } from "$lib/server/auth";
import { collections } from "$lib/server/database";
import { DEFAULT_SETTINGS } from "$lib/types/Settings";
import { defaultModel, models } from "$lib/server/models";

export const GET: RequestHandler = async ({ locals }) => {
	const settings = await collections.settings.findOne(authCondition(locals));
	const activeModelId = settings?.activeModel ?? DEFAULT_SETTINGS.activeModel;
	const model = models.find((m) => m.id === activeModelId) ?? defaultModel;

	return json({
		model: {
			id: model.id,
			name: model.name,
			displayName: model.displayName,
			multimodal: model.multimodal,
			supportsTools: (model as unknown as { supportsTools?: boolean }).supportsTools ?? false,
			isRouter: (model as unknown as { isRouter?: boolean }).isRouter ?? false,
		},
	});
};


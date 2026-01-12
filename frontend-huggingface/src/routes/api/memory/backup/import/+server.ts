import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { z } from "zod";

const importBodySchema = z.object({
	payload: z.unknown(),
	dryRun: z.boolean().optional(),
	mergeStrategy: z.enum(["replace", "merge", "skip_existing"]).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.isAdmin) {
		return json({ success: false, error: "Not admin" }, { status: 403 });
	}

	const parsed = importBodySchema.safeParse(await request.json());
	if (!parsed.success) {
		return json({ success: false, error: "Invalid body" }, { status: 400 });
	}

	const facade = UnifiedMemoryFacade.getInstance();
	const result = await facade.importBackup({
		userId: ADMIN_USER_ID,
		payload: parsed.data.payload as any,
		dryRun: parsed.data.dryRun ?? false,
		mergeStrategy: parsed.data.mergeStrategy ?? "merge",
	});

	return json(result);
};

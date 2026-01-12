import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { z } from "zod";

const bodySchema = z
	.object({
		dryRun: z.boolean().optional(),
		sampleSize: z.number().int().positive().max(5000).optional(),
	})
	.optional();

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.isAdmin) {
		return json({ success: false, error: "Not admin" }, { status: 403 });
	}

	const parsed = bodySchema.safeParse(await request.json().catch(() => undefined));
	if (!parsed.success) {
		return json({ success: false, error: "Invalid body" }, { status: 400 });
	}

	const facade = UnifiedMemoryFacade.getInstance();
	const result = await facade.consistencyCheck({
		userId: ADMIN_USER_ID,
		...(parsed.data?.dryRun !== undefined ? { dryRun: parsed.data.dryRun } : {}),
		...(parsed.data?.sampleSize !== undefined ? { sampleSize: parsed.data.sampleSize } : {}),
	});

	return json({ success: true, result });
};

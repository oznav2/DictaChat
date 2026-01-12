import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { z } from "zod";

const reindexBodySchema = z
	.object({
		tier: z.string().optional(),
		since: z.string().optional(),
	})
	.optional();

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.isAdmin) {
		return json({ success: false, error: "Not admin" }, { status: 403 });
	}

	const facade = UnifiedMemoryFacade.getInstance();
	const progress = facade.getReindexProgress();
	return json({ success: true, progress });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.isAdmin) {
		return json({ success: false, error: "Not admin" }, { status: 403 });
	}

	const parsed = reindexBodySchema.safeParse(await request.json().catch(() => undefined));
	if (!parsed.success) {
		return json({ success: false, error: "Invalid body" }, { status: 400 });
	}

	const facade = UnifiedMemoryFacade.getInstance();
	const result = await facade.reindexFromMongo({
		userId: ADMIN_USER_ID,
		tier: parsed.data?.tier as any,
		since: parsed.data?.since,
	});
	return json({ success: true, result });
};

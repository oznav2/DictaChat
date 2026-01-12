import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import { ADMIN_USER_ID } from "$lib/server/constants";

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.isAdmin) {
		return json({ success: false, error: "Not admin" }, { status: 403 });
	}

	const facade = UnifiedMemoryFacade.getInstance();
	const stats = await facade.promoteNow(ADMIN_USER_ID);
	return json({ success: true, stats });
};

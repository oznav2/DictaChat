import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade } from "$lib/server/memory";

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.isAdmin) {
		return json({ success: false, error: "Not admin" }, { status: 403 });
	}

	const facade = UnifiedMemoryFacade.getInstance();
	const paused = facade.pauseReindex();
	return json({ success: true, paused });
};

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import { ADMIN_USER_ID } from "$lib/server/constants";

export const POST: RequestHandler = async () => {
	try {
		const facade = UnifiedMemoryFacade.getInstance();
		const result = await facade.promoteNow(ADMIN_USER_ID);
		return json({ success: true, result });
	} catch (err) {
		console.error("[API] Failed to force decay run:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to force decay run" },
			{ status: 500 }
		);
	}
};

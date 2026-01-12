import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade, defaultMemoryConfig } from "$lib/server/memory";

export const GET: RequestHandler = async () => {
	try {
		const facadeAny = UnifiedMemoryFacade.getInstance() as any;
		const ops: any = facadeAny?.services?.ops;
		const promotion: any = ops?.promotion;

		const running =
			typeof promotion?.isSchedulerRunning === "function"
				? Boolean(promotion.isSchedulerRunning())
				: false;
		const lastRunAt =
			typeof promotion?.getLastRunAt === "function"
				? promotion.getLastRunAt()
					? new Date(promotion.getLastRunAt()).toISOString()
					: null
				: null;

		return json({
			success: true,
			schedule: {
				kind: "promotion_cycle",
				interval_ms: defaultMemoryConfig.promotion.scheduler_interval_ms,
				running,
				last_run_at: lastRunAt,
			},
		});
	} catch (err) {
		console.error("[API] Failed to get decay schedule:", err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Failed to get decay schedule",
			},
			{ status: 500 }
		);
	}
};

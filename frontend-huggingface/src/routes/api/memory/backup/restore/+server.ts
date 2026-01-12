import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { z } from "zod";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import { ADMIN_USER_ID } from "$lib/server/constants";

const bodySchema = z.object({
	payload: z.unknown(),
	mergeStrategy: z.enum(["replace", "merge", "skip_existing"]).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.isAdmin) {
		return json({ success: false, error: "Not admin" }, { status: 403 });
	}

	const parsed = bodySchema.safeParse(await request.json());
	if (!parsed.success) {
		return json({ success: false, error: "Invalid body" }, { status: 400 });
	}

	const facade = UnifiedMemoryFacade.getInstance();

	const preRestore = await facade.exportBackup({
		userId: ADMIN_USER_ID,
		includeArchived: true,
		includeTiers: "all",
		includeOutcomes: true,
		includeActionOutcomes: true,
		includeKg: true,
		includeRoutingKg: true,
		includeActionKg: true,
		includeVersions: true,
		includePersonalityMappings: true,
		includeReindexCheckpoints: true,
		includeConsistencyLogs: true,
	});

	const importResult = await facade.importBackup({
		userId: ADMIN_USER_ID,
		payload: parsed.data.payload as any,
		dryRun: false,
		mergeStrategy: parsed.data.mergeStrategy ?? "merge",
	});

	return json({
		success: importResult.success,
		preRestore: {
			exportedAt: preRestore.exportedAt,
			size_bytes: preRestore.size_bytes,
			payload: preRestore.payload,
		},
		import: importResult,
	});
};


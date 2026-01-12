import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { UnifiedMemoryFacade, type MemoryTier } from "$lib/server/memory";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { z } from "zod";
import yazl from "yazl";

const exportQuerySchema = z.object({
	format: z.enum(["json", "zip"]).optional(),
	includeArchived: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includeTiers: z.string().optional(),
	includeOutcomes: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includeActionOutcomes: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includeKg: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includeRoutingKg: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includeActionKg: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includeVersions: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includePersonalityMappings: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includeReindexCheckpoints: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	includeConsistencyLogs: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
});

function parseTiers(raw: string | undefined): MemoryTier[] | "all" {
	if (!raw) return "all";
	if (raw === "all") return "all";
	const parts = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return parts as MemoryTier[];
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.isAdmin) {
		return json({ success: false, error: "Not admin" }, { status: 403 });
	}

	const parsed = exportQuerySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ success: false, error: "Invalid query" }, { status: 400 });
	}

	const format = parsed.data.format ?? "json";
	const facade = UnifiedMemoryFacade.getInstance();
	const backup = await facade.exportBackup({
		userId: ADMIN_USER_ID,
		includeArchived: parsed.data.includeArchived,
		includeTiers: parseTiers(parsed.data.includeTiers),
		includeOutcomes: parsed.data.includeOutcomes,
		includeActionOutcomes: parsed.data.includeActionOutcomes,
		includeKg: parsed.data.includeKg,
		includeRoutingKg: parsed.data.includeRoutingKg,
		includeActionKg: parsed.data.includeActionKg,
		includeVersions: parsed.data.includeVersions,
		includePersonalityMappings: parsed.data.includePersonalityMappings,
		includeReindexCheckpoints: parsed.data.includeReindexCheckpoints,
		includeConsistencyLogs: parsed.data.includeConsistencyLogs,
	});

	const dateTag = backup.exportedAt.replace(/[:.]/g, "-");
	const baseName = `bricksllm-backup-${dateTag}`;

	if (format === "zip") {
		const zipfile = new yazl.ZipFile();
		const jsonBuffer = Buffer.from(JSON.stringify(backup.payload, null, 2), "utf8");
		zipfile.addBuffer(jsonBuffer, `${baseName}.json`);
		zipfile.end();

		return new Response(zipfile.outputStream as unknown as ReadableStream, {
			headers: {
				"Content-Type": "application/zip",
				"Content-Disposition": `attachment; filename="${baseName}.zip"`,
			},
		});
	}

	return new Response(JSON.stringify(backup.payload, null, 2), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Content-Disposition": `attachment; filename="${baseName}.json"`,
		},
	});
};

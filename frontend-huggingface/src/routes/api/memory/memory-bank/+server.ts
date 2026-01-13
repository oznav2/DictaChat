import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections, Database } from "$lib/server/database";
import { UnifiedMemoryFacade } from "$lib/server/memory";
import { ADMIN_USER_ID } from "$lib/server/constants";
import { config } from "$lib/server/config";
import { MEMORY_COLLECTIONS } from "$lib/server/memory/stores/schemas";

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0.5;
	return Math.max(0, Math.min(1, value));
}

// GET /api/memory/memory-bank - List memory bank items
// Queries from BOTH the dedicated memoryBank collection AND the memory_items collection (tier=memory_bank)
export const GET: RequestHandler = async ({ url }) => {
	try {
		const status = url.searchParams.get("status") || "active";
		const tag = url.searchParams.get("tag");
		const limit = parseInt(url.searchParams.get("limit") || "100", 10);
		const offset = parseInt(url.searchParams.get("offset") || "0", 10);

		// Query from dedicated memoryBank collection
		const mbQuery: Record<string, unknown> = {
			userId: ADMIN_USER_ID,
			status: status === "archived" ? "archived" : "active",
		};
		if (tag) {
			mbQuery.tags = tag;
		}

		const memoryBankItems = await collections.memoryBank
			.find(mbQuery)
			.sort({ createdAt: -1 })
			.toArray();

		// Also query from memory_items collection (tier=memory_bank)
		const database = await Database.getInstance();
		const client = database.getClient();
		const db = client.db(config.MONGODB_DB_NAME);
		const itemsCollection = db.collection(MEMORY_COLLECTIONS.ITEMS);

		const itemsQuery: Record<string, unknown> = {
			user_id: ADMIN_USER_ID,
			tier: "memory_bank",
			status: status === "archived" ? "archived" : "active",
		};
		if (tag) {
			itemsQuery.tags = tag;
		}

		const memoryItems = await itemsCollection
			.find(itemsQuery)
			.sort({ updated_at: -1 })
			.toArray();

		// Combine and deduplicate by content hash or ID
		const seenTexts = new Set<string>();
		const allMemories: Array<{
			id: string;
			text: string;
			tags: string[];
			status: string;
			score: number;
			created_at: string | undefined;
			archived_at: string | undefined;
			archived_reason: string | undefined;
			source: {
				toolName: string;
				url: string | null;
				description: string | null;
				descriptionHe: string | null;
				conversationTitle: string | null;
				collectedAt: string | undefined;
			};
			sourcePersonalityId?: string | null;
			sourcePersonalityName?: string | null;
		}> = [];

		// Add items from memoryBank collection
		for (const m of memoryBankItems) {
			const textKey = m.text?.toLowerCase().trim() ?? "";
			if (seenTexts.has(textKey)) continue;
			seenTexts.add(textKey);

			const importance = Number(m.importance);
			const confidence = Number(m.confidence);
			let derivedScore = 0.5;
			if (Number.isFinite(importance) && Number.isFinite(confidence)) {
				derivedScore = (importance + confidence) / 2;
			} else if (Number.isFinite(importance)) {
				derivedScore = importance;
			} else if (Number.isFinite(confidence)) {
				derivedScore = confidence;
			}

			allMemories.push({
				id: m._id.toString(),
				text: m.text,
				tags: m.tags || [],
				status: m.status,
				score: clamp01(derivedScore),
				created_at: m.createdAt?.toISOString(),
				archived_at: m.archivedAt?.toISOString(),
				archived_reason: m.archivedReason,
				source: {
					toolName:
						typeof m.source === "string" && m.source
							? m.source.startsWith("http://") || m.source.startsWith("https://")
								? "fetch"
								: m.source
							: "conversation",
					url:
						typeof m.source === "string" &&
						(m.source.startsWith("http://") || m.source.startsWith("https://"))
							? m.source
							: null,
					description: m.contextType ?? null,
					descriptionHe: null,
					conversationTitle: null,
					collectedAt: m.createdAt?.toISOString(),
				},
			});
		}

		// Add items from memory_items collection (tier=memory_bank)
		for (const m of memoryItems) {
			const textKey = (m.text as string)?.toLowerCase().trim() ?? "";
			if (seenTexts.has(textKey)) continue;
			seenTexts.add(textKey);

			const wilsonScore = Number((m.stats as Record<string, unknown>)?.wilson_score ?? 0.5);
			const qualityScore = Number((m.quality as Record<string, unknown>)?.quality_score ?? 0.5);
			const derivedScore = Math.max(wilsonScore, qualityScore);

			const sourceObj = m.source as Record<string, unknown> | undefined;

			allMemories.push({
				id: (m.memory_id as string) || m._id?.toString() || "",
				text: m.text as string,
				tags: (m.tags as string[]) || [],
				status: m.status as string,
				score: clamp01(derivedScore),
				created_at: (m.created_at as Date)?.toISOString() ?? (m.updated_at as Date)?.toISOString(),
				archived_at: (m.archived_at as Date)?.toISOString(),
				archived_reason: m.archived_reason as string | undefined,
				source: {
					toolName: (sourceObj?.tool_name as string) ?? (sourceObj?.type as string) ?? "memory_system",
					url: (sourceObj?.url as string) ?? null,
					description: (sourceObj?.description as string) ?? null,
					descriptionHe: (sourceObj?.description_he as string) ?? null,
					conversationTitle: (sourceObj?.conversation_title as string) ?? null,
					collectedAt: (sourceObj?.collected_at as string) ?? (m.created_at as Date)?.toISOString(),
				},
				sourcePersonalityId: (sourceObj?.personality_id as string) ?? null,
				sourcePersonalityName: (sourceObj?.personality_name as string) ?? null,
			});
		}

		// Sort by created_at descending
		allMemories.sort((a, b) => {
			const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
			const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
			return bTime - aTime;
		});

		// Apply pagination
		const paginatedMemories = allMemories.slice(offset, offset + limit);
		const total = allMemories.length;

		return json({
			success: true,
			memories: paginatedMemories,
			total,
		});
	} catch (err) {
		console.error("[API] Failed to list memory bank:", err);
		return json(
			{ success: false, error: err instanceof Error ? err.message : "Failed to list memories" },
			{ status: 500 }
		);
	}
};

// POST /api/memory/memory-bank - Add to memory bank
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { text, tags, importance } = await request.json();

		if (!text || typeof text !== "string") {
			return error(400, "text is required");
		}

		const facade = UnifiedMemoryFacade.getInstance();
		const result = await facade.store({
			userId: ADMIN_USER_ID,
			tier: "memory_bank",
			text,
			tags: tags || [],
			importance: importance || 0.8,
		});

		return json({
			success: true,
			id: result.memory_id,
			message: "Added to memory bank",
		});
	} catch (err) {
		console.error("[API] Failed to add to memory bank:", err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : "Failed to add to memory bank",
			},
			{ status: 500 }
		);
	}
};

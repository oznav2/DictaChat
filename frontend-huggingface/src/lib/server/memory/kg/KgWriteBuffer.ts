import type { AnyBulkWriteOperation, Collection } from "mongodb";
import { logger } from "$lib/server/logger";
import type { MemoryTier, Outcome } from "../types";
import type { ActionExample, ActionEffectiveness, KgEdge, KgNode } from "./types";

type NodeKey = string;
type EdgeKey = string;
type ActionKey = string;

type NodeDelta = {
	user_id: string;
	node_id: string;
	label: string;
	node_type: KgNode["node_type"];
	aliases: Set<string>;
	last_seen_at: Date;
	mentions_delta: number;
	quality_delta: number;
	memory_ids: Set<string>;
};

type EdgeDelta = {
	user_id: string;
	edge_id: string;
	source_id: string;
	target_id: string;
	relation_type: KgEdge["relation_type"];
	last_seen_at: Date;
	weight_delta: number;
};

type ActionDelta = {
	user_id: string;
	context_type: ActionEffectiveness["context_type"];
	action: string;
	tier: MemoryTier | null;
	uses_delta: number;
	outcome_deltas: Record<Outcome, number>;
	examples: ActionExample[];
	last_used_at: Date;
};

export class KgWriteBuffer {
	private kgNodes: Collection<KgNode>;
	private kgEdges: Collection<KgEdge>;
	private actionEffectiveness: Collection<ActionEffectiveness>;
	private contextActionEffectiveness: Collection<any> | null = null;
	private flushIntervalMs: number;
	private maxActionExamples: number;
	private timer: ReturnType<typeof setInterval> | null = null;
	private flushing = false;
	private pendingFlush = false;

	private nodeDeltas = new Map<NodeKey, NodeDelta>();
	private edgeDeltas = new Map<EdgeKey, EdgeDelta>();
	private actionDeltas = new Map<ActionKey, ActionDelta>();

	constructor(params: {
		kgNodes: Collection<KgNode>;
		kgEdges: Collection<KgEdge>;
		actionEffectiveness: Collection<ActionEffectiveness>;
		contextActionEffectiveness?: Collection<any> | null;
		flushIntervalMs: number;
		autoFlush: boolean;
		maxActionExamples: number;
	}) {
		this.kgNodes = params.kgNodes;
		this.kgEdges = params.kgEdges;
		this.actionEffectiveness = params.actionEffectiveness;
		this.contextActionEffectiveness = params.contextActionEffectiveness ?? null;
		this.flushIntervalMs = params.flushIntervalMs;
		this.maxActionExamples = params.maxActionExamples;
		if (params.autoFlush) {
			this.timer = setInterval(() => {
				void this.flush();
			}, this.flushIntervalMs);
		}
	}

	stop() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	enqueueNode(params: {
		userId: string;
		nodeId: string;
		label: string;
		nodeType: KgNode["node_type"];
		aliases?: string[];
		memoryId: string;
		quality: number;
		now: Date;
	}) {
		const key: NodeKey = `${params.userId}:${params.nodeId}`;
		const existing = this.nodeDeltas.get(key);
		if (existing) {
			existing.last_seen_at = params.now;
			for (const a of params.aliases ?? []) existing.aliases.add(a);
			existing.mentions_delta += 1;
			existing.quality_delta += params.quality;
			existing.memory_ids.add(params.memoryId);
			return;
		}
		this.nodeDeltas.set(key, {
			user_id: params.userId,
			node_id: params.nodeId,
			label: params.label,
			node_type: params.nodeType,
			aliases: new Set(params.aliases ?? []),
			last_seen_at: params.now,
			mentions_delta: 1,
			quality_delta: params.quality,
			memory_ids: new Set([params.memoryId]),
		});
	}

	enqueueEdge(params: {
		userId: string;
		edgeId: string;
		sourceId: string;
		targetId: string;
		relationType: KgEdge["relation_type"];
		now: Date;
	}) {
		const key: EdgeKey = `${params.userId}:${params.edgeId}`;
		const existing = this.edgeDeltas.get(key);
		if (existing) {
			existing.last_seen_at = params.now;
			existing.weight_delta += 1;
			return;
		}
		this.edgeDeltas.set(key, {
			user_id: params.userId,
			edge_id: params.edgeId,
			source_id: params.sourceId,
			target_id: params.targetId,
			relation_type: params.relationType,
			last_seen_at: params.now,
			weight_delta: 1,
		});
	}

	enqueueAction(params: {
		userId: string;
		contextType: ActionEffectiveness["context_type"];
		action: string;
		tier: MemoryTier | null;
		outcome: Outcome;
		example: ActionExample;
	}) {
		const key: ActionKey = `${params.userId}:${params.contextType}:${params.action}:${params.tier ?? ""}`;
		const existing = this.actionDeltas.get(key);
		if (existing) {
			existing.uses_delta += 1;
			existing.outcome_deltas[params.outcome] = (existing.outcome_deltas[params.outcome] ?? 0) + 1;
			existing.examples.push(params.example);
			if (params.example.timestamp > existing.last_used_at) {
				existing.last_used_at = params.example.timestamp;
			}
			return;
		}
		this.actionDeltas.set(key, {
			user_id: params.userId,
			context_type: params.contextType,
			action: params.action,
			tier: params.tier,
			uses_delta: 1,
			outcome_deltas: {
				worked: params.outcome === "worked" ? 1 : 0,
				failed: params.outcome === "failed" ? 1 : 0,
				partial: params.outcome === "partial" ? 1 : 0,
				unknown: params.outcome === "unknown" ? 1 : 0,
			},
			examples: [params.example],
			last_used_at: params.example.timestamp,
		});
	}

	async flush(): Promise<void> {
		if (this.flushing) {
			this.pendingFlush = true;
			return;
		}
		this.flushing = true;
		try {
			for (;;) {
				this.pendingFlush = false;

				const nodes = Array.from(this.nodeDeltas.values());
				const edges = Array.from(this.edgeDeltas.values());
				const actions = Array.from(this.actionDeltas.values());
				this.nodeDeltas.clear();
				this.edgeDeltas.clear();
				this.actionDeltas.clear();

				await this.flushNodes(nodes);
				await this.flushEdges(edges);
				await this.flushActions(actions);

				if (!this.pendingFlush) break;
			}
		} finally {
			this.flushing = false;
		}
	}

	private async flushNodes(nodes: NodeDelta[]) {
		if (nodes.length === 0) return;
		const ops: AnyBulkWriteOperation<KgNode>[] = nodes.map((d) => ({
			updateOne: {
				filter: { user_id: d.user_id, node_id: d.node_id },
				update: [
					{
						$set: {
							user_id: d.user_id,
							node_id: d.node_id,
							label: { $ifNull: ["$label", d.label] },
							node_type: { $ifNull: ["$node_type", d.node_type] },
							aliases: {
								$setUnion: [{ $ifNull: ["$aliases", []] }, Array.from(d.aliases)],
							},
							first_seen_at: { $ifNull: ["$first_seen_at", d.last_seen_at] },
							last_seen_at: d.last_seen_at,
							mentions: {
								$add: [{ $ifNull: ["$mentions", 0] }, d.mentions_delta],
							},
							quality_sum: {
								$add: [{ $ifNull: ["$quality_sum", 0] }, d.quality_delta],
							},
							memory_ids: {
								$setUnion: [{ $ifNull: ["$memory_ids", []] }, Array.from(d.memory_ids)],
							},
						},
					},
					{
						$set: {
							avg_quality: {
								$cond: [
									{ $gt: ["$mentions", 0] },
									{ $divide: ["$quality_sum", "$mentions"] },
									0,
								],
							},
						},
					},
				],
				upsert: true,
			},
		}));

		try {
			const bulkWrite = (this.kgNodes as unknown as { bulkWrite?: unknown }).bulkWrite;
			if (typeof bulkWrite === "function") {
				await this.kgNodes.bulkWrite(ops, { ordered: false });
			} else {
				await Promise.all(
					ops.map((op) => {
						if (!("updateOne" in op) || !op.updateOne) return Promise.resolve();
						return (this.kgNodes as any).updateOne(op.updateOne.filter, op.updateOne.update, {
							upsert: op.updateOne.upsert,
						});
					})
				);
			}
		} catch (err) {
			logger.error({ err }, "KgWriteBuffer: bulkWrite kg_nodes failed");
		}
	}

	private async flushEdges(edges: EdgeDelta[]) {
		if (edges.length === 0) return;
		const ops: AnyBulkWriteOperation<KgEdge>[] = edges.map((d) => ({
			updateOne: {
				filter: { user_id: d.user_id, edge_id: d.edge_id },
				update: [
					{
						$set: {
							user_id: d.user_id,
							edge_id: d.edge_id,
							source_id: { $ifNull: ["$source_id", d.source_id] },
							target_id: { $ifNull: ["$target_id", d.target_id] },
							relation_type: { $ifNull: ["$relation_type", d.relation_type] },
							first_seen_at: { $ifNull: ["$first_seen_at", d.last_seen_at] },
							last_seen_at: d.last_seen_at,
							weight: {
								$add: [{ $ifNull: ["$weight", 0] }, d.weight_delta],
							},
						},
					},
				],
				upsert: true,
			},
		}));

		try {
			const bulkWrite = (this.kgEdges as unknown as { bulkWrite?: unknown }).bulkWrite;
			if (typeof bulkWrite === "function") {
				await this.kgEdges.bulkWrite(ops, { ordered: false });
			} else {
				await Promise.all(
					ops.map((op) => {
						if (!("updateOne" in op) || !op.updateOne) return Promise.resolve();
						return (this.kgEdges as any).updateOne(op.updateOne.filter, op.updateOne.update, {
							upsert: op.updateOne.upsert,
						});
					})
				);
			}
		} catch (err) {
			logger.error({ err }, "KgWriteBuffer: bulkWrite kg_edges failed");
		}
	}

	private async flushActions(actions: ActionDelta[]) {
		if (actions.length === 0) return;
		const z = 1.96;
		const z2 = 3.8416;

		const ops: AnyBulkWriteOperation<ActionEffectiveness>[] = actions.map((d) => ({
			updateOne: {
				filter: {
					user_id: d.user_id,
					context_type: d.context_type,
					action: d.action,
					tier: d.tier,
				},
				update: [
					{
						$set: {
							user_id: d.user_id,
							context_type: d.context_type,
							action: d.action,
							tier: d.tier,
							uses: { $add: [{ $ifNull: ["$uses", 0] }, d.uses_delta] },
							worked: {
								$add: [{ $ifNull: ["$worked", 0] }, d.outcome_deltas.worked ?? 0],
							},
							failed: {
								$add: [{ $ifNull: ["$failed", 0] }, d.outcome_deltas.failed ?? 0],
							},
							partial: {
								$add: [{ $ifNull: ["$partial", 0] }, d.outcome_deltas.partial ?? 0],
							},
							unknown: {
								$add: [{ $ifNull: ["$unknown", 0] }, d.outcome_deltas.unknown ?? 0],
							},
							examples: {
								$slice: [
									{
										$concatArrays: [{ $ifNull: ["$examples", []] }, d.examples],
									},
									-this.maxActionExamples,
								],
							},
						},
					},
					{
						$set: {
							success_rate: {
								$let: {
									vars: {
										total: { $add: ["$worked", "$failed"] },
									},
									in: {
										$cond: [
											{ $gt: ["$$total", 0] },
											{ $divide: ["$worked", "$$total"] },
											0.5,
										],
									},
								},
							},
							wilson_score: {
								$let: {
									vars: {
										total: { $add: ["$worked", "$failed"] },
									},
									in: {
										$cond: [
											{ $gt: ["$$total", 0] },
											{
												$let: {
													vars: {
														p: { $divide: ["$worked", "$$total"] },
													},
													in: {
														$let: {
															vars: {
																denominator: { $add: [1, { $divide: [z2, "$$total"] }] },
																center: {
																	$add: [
																		"$$p",
																		{ $divide: [z2, { $multiply: [2, "$$total"] }] },
																	],
																},
																spread: {
																	$multiply: [
																		z,
																		{
																			$sqrt: {
																				$divide: [
																					{
																						$add: [
																							{ $multiply: ["$$p", { $subtract: [1, "$$p"] }] },
																							{ $divide: [z2, { $multiply: [4, "$$total"] }] },
																						],
																					},
																					"$$total",
																				],
																			},
																		},
																	],
																},
															},
															in: {
																$divide: [{ $subtract: ["$$center", "$$spread"] }, "$$denominator"],
															},
														},
													},
												},
											},
											0.5,
										],
									},
								},
							},
						},
					},
				],
				upsert: true,
			},
		}));

		try {
			const bulkWrite = (this.actionEffectiveness as unknown as { bulkWrite?: unknown }).bulkWrite;
			if (typeof bulkWrite === "function") {
				await this.actionEffectiveness.bulkWrite(ops, { ordered: false });
			} else {
				await Promise.all(
					ops.map((op) => {
						if (!("updateOne" in op) || !op.updateOne) return Promise.resolve();
						return (this.actionEffectiveness as any).updateOne(
							op.updateOne.filter,
							op.updateOne.update,
							{ upsert: op.updateOne.upsert }
						);
					})
				);
			}
		} catch (err) {
			logger.error({ err }, "KgWriteBuffer: bulkWrite kg_action_effectiveness failed");
		}

		if (!this.contextActionEffectiveness) return;

		const rollupOps: AnyBulkWriteOperation<any>[] = [];
		for (const d of actions) {
			const tierKeys = ["*", d.tier].filter((t): t is string | MemoryTier => typeof t === "string");
			for (const tierKey of tierKeys) {
				if (tierKey !== "*" && d.tier === null) continue;
				rollupOps.push({
					updateOne: {
						filter: {
							user_id: d.user_id,
							context_type: d.context_type,
							action: d.action,
							tier_key: tierKey,
						},
						update: [
							{
								$set: {
									user_id: d.user_id,
									context_type: d.context_type,
									action: d.action,
									tier_key: tierKey,
									first_used_at: { $ifNull: ["$first_used_at", d.last_used_at] },
									last_used_at: d.last_used_at,
									uses: { $add: [{ $ifNull: ["$uses", 0] }, d.uses_delta] },
									worked: {
										$add: [{ $ifNull: ["$worked", 0] }, d.outcome_deltas.worked ?? 0],
									},
									failed: {
										$add: [{ $ifNull: ["$failed", 0] }, d.outcome_deltas.failed ?? 0],
									},
									partial: {
										$add: [{ $ifNull: ["$partial", 0] }, d.outcome_deltas.partial ?? 0],
									},
									unknown: {
										$add: [{ $ifNull: ["$unknown", 0] }, d.outcome_deltas.unknown ?? 0],
									},
								},
							},
							{
								$set: {
									success_rate: {
										$let: {
											vars: {
												total: { $add: ["$worked", "$failed"] },
											},
											in: {
												$cond: [
													{ $gt: ["$$total", 0] },
													{ $divide: ["$worked", "$$total"] },
													0.5,
												],
											},
										},
									},
									wilson_score: {
										$let: {
											vars: {
												total: { $add: ["$worked", "$failed"] },
											},
											in: {
												$cond: [
													{ $gt: ["$$total", 0] },
													{
														$let: {
															vars: {
																p: { $divide: ["$worked", "$$total"] },
															},
															in: {
																$let: {
																	vars: {
																		denominator: {
																			$add: [1, { $divide: [z2, "$$total"] }],
																		},
																		center: {
																			$add: [
																				"$$p",
																				{ $divide: [z2, { $multiply: [2, "$$total"] }] },
																			],
																		},
																		spread: {
																			$multiply: [
																				z,
																				{
																					$sqrt: {
																						$divide: [
																							{
																								$add: [
																									{
																										$multiply: [
																											"$$p",
																											{ $subtract: [1, "$$p"] },
																										],
																									},
																									{
																										$divide: [
																											z2,
																											{ $multiply: [4, "$$total"] },
																										],
																									},
																								],
																							},
																							"$$total",
																						],
																					},
																				},
																			],
																		},
																	},
																	in: {
																		$divide: [
																			{ $subtract: ["$$center", "$$spread"] },
																			"$$denominator",
																		],
																	},
																},
															},
														},
													},
													0.5,
												],
											},
										},
									},
								},
							},
						],
						upsert: true,
					},
				});
			}
		}

		try {
			const bulkWrite = (this.contextActionEffectiveness as unknown as { bulkWrite?: unknown }).bulkWrite;
			if (typeof bulkWrite === "function") {
				await this.contextActionEffectiveness.bulkWrite(rollupOps, { ordered: false });
			} else {
				await Promise.all(
					rollupOps.map((op) => {
						if (!("updateOne" in op) || !op.updateOne) return Promise.resolve();
						return (this.contextActionEffectiveness as any).updateOne(
							op.updateOne.filter,
							op.updateOne.update,
							{ upsert: op.updateOne.upsert }
						);
					})
				);
			}
		} catch (err) {
			logger.error({ err }, "KgWriteBuffer: bulkWrite kg_context_action_effectiveness failed");
		}
	}
}

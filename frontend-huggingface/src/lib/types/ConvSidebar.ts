import type { ObjectId } from "bson";

export interface ConvSidebar {
	id: ObjectId | string;
	title: string;
	updatedAt: Date;
	model?: string;
	avatarUrl?: string | Promise<string | undefined>;
	// Personality tracking for cross-personality memory access
	personalityId?: string;
	personalityBadge?: {
		name: string;
		color: string;
	};
}

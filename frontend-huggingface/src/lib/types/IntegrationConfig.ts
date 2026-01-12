import type { ObjectId } from "mongodb";

export interface IntegrationConfig {
	_id: ObjectId;
	userId: string;
	integrationId: string;
	enabled: boolean;
	displayName?: string;
	createdAt: Date;
	updatedAt?: Date;
}


import type { ObjectId } from "mongodb";

export interface UserPersonality {
	_id: ObjectId;
	userId: string;
	yaml_content: string;
	preset_name?: string | null;
	preset_description?: string | null;
	createdAt: Date;
	updatedAt: Date;
}

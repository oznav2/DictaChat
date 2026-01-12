import { triggerOauthFlow } from "$lib/server/auth";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async (event) => {
	return await triggerOauthFlow(event);
};

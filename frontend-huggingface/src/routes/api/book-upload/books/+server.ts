import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { base } from "$app/paths";

export const GET: RequestHandler = async () => {
	throw redirect(307, `${base}/api/memory/books`);
};

export const POST: RequestHandler = async () => {
	throw redirect(307, `${base}/api/memory/books`);
};

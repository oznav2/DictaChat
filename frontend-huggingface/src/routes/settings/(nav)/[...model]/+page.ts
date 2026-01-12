import { base } from "$app/paths";
import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ parent, params }) => {
	const data = await parent();

	const model = data.models.find((m: { id: string }) => m.id === params.model);

	if (!model || model.unlisted) {
		redirect(302, `${base}/settings`);
	}

	return data;
};

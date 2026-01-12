export type PatchKind = "code_fence" | "begin_patch";

export interface ExtractedPatch {
	kind: PatchKind;
	raw: string;
	patchText: string;
}

export interface ExtractedPatchesResult {
	patches: ExtractedPatch[];
	strippedText: string;
}

const FENCED_DIFF_REGEX = /```(diff|patch)\n([\s\S]*?)```/g;
const BEGIN_PATCH_REGEX = /\*\*\* Begin Patch[\s\S]*?\*\*\* End Patch/g;

export function extractPatchesFromText(text: string): ExtractedPatchesResult {
	const patches: ExtractedPatch[] = [];
	let strippedText = text;

	strippedText = strippedText.replace(FENCED_DIFF_REGEX, (raw, _lang, body) => {
		patches.push({ kind: "code_fence", raw, patchText: String(body ?? "").trim() });
		return "";
	});

	strippedText = strippedText.replace(BEGIN_PATCH_REGEX, (raw) => {
		patches.push({ kind: "begin_patch", raw, patchText: String(raw ?? "").trim() });
		return "";
	});

	return { patches, strippedText: strippedText.trim() };
}

export interface PatchFile {
	path: string;
	content: string;
}

export function splitPatchByFile(patchText: string): PatchFile[] {
	const lines = patchText.split("\n");
	const files: PatchFile[] = [];

	let currentPath: string | null = null;
	let currentLines: string[] = [];

	const flush = () => {
		if (!currentPath) return;
		files.push({ path: currentPath, content: currentLines.join("\n").trim() });
		currentPath = null;
		currentLines = [];
	};

	for (const line of lines) {
		const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
		if (m) {
			flush();
			currentPath = m[2] || m[1];
			currentLines.push(line);
			continue;
		}

		const addFile = line.match(/^\*\*\* (Add|Update|Delete) File:\s+(.+)$/);
		if (addFile) {
			flush();
			currentPath = addFile[2];
			currentLines.push(line);
			continue;
		}

		if (!currentPath) {
			currentPath = "patch";
		}
		currentLines.push(line);
	}

	flush();

	if (files.length === 0) {
		return [{ path: "patch", content: patchText.trim() }];
	}

	return files;
}

const RISKY_PATH_REGEX =
	/(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Dockerfile|docker-compose\.ya?ml|\.env(\.|$)|tsconfig\.json|svelte\.config\.(js|ts)|vite\.config\.(js|ts))$/i;

export function isRiskyPath(path: string): boolean {
	return RISKY_PATH_REGEX.test(path);
}

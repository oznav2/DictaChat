import fs from "node:fs/promises";
import path from "node:path";

export type PatchOpKind = "add" | "update" | "delete";

export interface PatchOp {
	kind: PatchOpKind;
	filePath: string;
	patchText: string;
}

export interface PatchApplyResult {
	filePath: string;
	kind: PatchOpKind;
	applied: boolean;
	error?: string;
}

function splitLines(text: string): string[] {
	return text.replace(/\r\n/g, "\n").split("\n");
}

export function parseTraeBeginPatch(patchText: string): PatchOp[] {
	const text = patchText.replace(/\r\n/g, "\n");
	const beginIdx = text.indexOf("*** Begin Patch");
	const endIdx = text.lastIndexOf("*** End Patch");
	if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) {
		throw new Error("Invalid Trae patch: missing Begin/End markers");
	}

	const body = text.slice(beginIdx, endIdx + "*** End Patch".length);
	const lines = splitLines(body);

	const ops: PatchOp[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const add = line?.startsWith("*** Add File: ");
		const update = line?.startsWith("*** Update File: ");
		const del = line?.startsWith("*** Delete File: ");

		if (!add && !update && !del) {
			i += 1;
			continue;
		}

		const filePath = String(line.split(":").slice(1).join(":")).trim();
		const kind: PatchOpKind = add ? "add" : update ? "update" : "delete";

		i += 1;
		const opLines: string[] = [];
		while (i < lines.length) {
			const l = lines[i];
			if (
				l?.startsWith("*** Add File: ") ||
				l?.startsWith("*** Update File: ") ||
				l?.startsWith("*** Delete File: ") ||
				l === "*** End Patch"
			) {
				break;
			}
			opLines.push(l);
			i += 1;
		}

		ops.push({ kind, filePath, patchText: opLines.join("\n") });
	}

	if (ops.length === 0) {
		throw new Error("Invalid Trae patch: no file operations found");
	}

	return ops;
}

function safeResolve(rootDir: string, relativePath: string): string {
	if (path.isAbsolute(relativePath)) {
		throw new Error("Absolute paths are not allowed");
	}
	const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
	const resolved = path.resolve(rootDir, normalized);
	const rootResolved = path.resolve(rootDir);
	if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
		throw new Error("Path escapes repository root");
	}
	return resolved;
}

function stripEndOfFileMarker(lines: string[]): string[] {
	const idx = lines.findIndex((l) => l === "*** End of File");
	return idx === -1 ? lines : lines.slice(0, idx);
}

function applyUpdatePatch(original: string, patchBody: string): string {
	const originalLines = splitLines(original);
	const patchLines = stripEndOfFileMarker(splitLines(patchBody));

	const out: string[] = [];
	let cursor = 0;

	const consumeUntilMatch = (expected: string): boolean => {
		for (let j = cursor; j < originalLines.length; j++) {
			if (originalLines[j] === expected) {
				out.push(...originalLines.slice(cursor, j));
				cursor = j;
				return true;
			}
		}
		return false;
	};

	for (const raw of patchLines) {
		if (raw.startsWith("@@")) continue;
		if (raw.startsWith("***")) continue;
		if (raw.length === 0) {
			continue;
		}

		const op = raw[0];
		const line = raw.slice(1);

		if (op === " ") {
			const matched = originalLines[cursor] === line || consumeUntilMatch(line);
			if (!matched) {
				throw new Error(`Context line not found: ${line}`);
			}
			out.push(originalLines[cursor]);
			cursor += 1;
		} else if (op === "-") {
			const matched = originalLines[cursor] === line || consumeUntilMatch(line);
			if (!matched) {
				throw new Error(`Delete line not found: ${line}`);
			}
			cursor += 1;
		} else if (op === "+") {
			out.push(line);
		} else {
			continue;
		}
	}

	out.push(...originalLines.slice(cursor));
	return out.join("\n");
}

function applyAddPatch(patchBody: string): string {
	const lines = stripEndOfFileMarker(splitLines(patchBody));
	return lines
		.filter((l) => l.startsWith("+"))
		.map((l) => l.slice(1))
		.join("\n");
}

export async function applyTraePatch(params: {
	rootDir: string;
	patchText: string;
	dryRun?: boolean;
	onlyFiles?: string[] | null;
}): Promise<{ results: PatchApplyResult[] }> {
	const ops = parseTraeBeginPatch(params.patchText);
	const only = params.onlyFiles && params.onlyFiles.length > 0 ? new Set(params.onlyFiles) : null;

	const results: PatchApplyResult[] = [];
	for (const op of ops) {
		if (only && !only.has(op.filePath)) continue;

		try {
			const absPath = safeResolve(params.rootDir, op.filePath);

			if (op.kind === "delete") {
				if (!params.dryRun) {
					await fs.rm(absPath, { force: true });
				}
				results.push({ filePath: op.filePath, kind: op.kind, applied: true });
				continue;
			}

			if (op.kind === "add") {
				const content = applyAddPatch(op.patchText);
				if (!params.dryRun) {
					await fs.mkdir(path.dirname(absPath), { recursive: true });
					await fs.writeFile(absPath, content, "utf8");
				}
				results.push({ filePath: op.filePath, kind: op.kind, applied: true });
				continue;
			}

			const before = await fs.readFile(absPath, "utf8");
			const after = applyUpdatePatch(before, op.patchText);
			if (!params.dryRun) {
				await fs.writeFile(absPath, after, "utf8");
			}
			results.push({ filePath: op.filePath, kind: op.kind, applied: true });
		} catch (err) {
			results.push({
				filePath: op.filePath,
				kind: op.kind,
				applied: false,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	return { results };
}

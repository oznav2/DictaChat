import type { Conversation } from "$lib/types/Conversation";
import type { MessageFile } from "$lib/types/Message";
import { sha256 } from "$lib/utils/sha256";
import { fileTypeFromBuffer } from "file-type";
import { collections } from "$lib/server/database";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

// Directory for MCP-accessible uploads (shared volume with mcp-sse-proxy)
const UPLOADS_DIR = "/app/uploads";

export async function uploadFile(file: File, conv: Conversation): Promise<MessageFile> {
	const sha = await sha256(await file.text());
	const buffer = await file.arrayBuffer();

	// Attempt to detect the mime type of the file, fallback to the uploaded mime
	const mime = await fileTypeFromBuffer(buffer).then((fileType) => fileType?.mime ?? file.type);

	// Also save to filesystem for MCP tools (Docling, etc.)
	// Do this FIRST so we have the path for GridFS metadata
	let filePath: string | undefined;
	try {
		// Ensure uploads directory exists
		if (!existsSync(UPLOADS_DIR)) {
			await mkdir(UPLOADS_DIR, { recursive: true });
		}

		// Create conversation-specific subdirectory
		const convDir = join(UPLOADS_DIR, conv._id.toString());
		if (!existsSync(convDir)) {
			await mkdir(convDir, { recursive: true });
		}

		// Save file with original name (sanitized)
		const safeName = file.name.replace(/[^a-zA-Z0-9._\-\u0590-\u05FF]/g, "_");
		filePath = join(convDir, `${sha.slice(0, 8)}_${safeName}`);
		await writeFile(filePath, Buffer.from(buffer));
	} catch (err) {
		console.error("Failed to save file to filesystem:", err);
		// Continue even if filesystem save fails - GridFS is primary
	}

	// Save to GridFS with path in metadata
	const upload = collections.bucket.openUploadStream(`${conv._id}-${sha}`, {
		metadata: { conversation: conv._id.toString(), mime, path: filePath },
	});

	upload.write(Buffer.from(buffer));
	upload.end();

	// only return the filename when upload throws a finish event or a 20s time out occurs
	return new Promise((resolve, reject) => {
		upload.once("finish", () =>
			resolve({
				type: "hash",
				value: sha,
				mime: file.type,
				name: file.name,
				// Add filesystem path for MCP tools
				...(filePath && { path: filePath }),
			})
		);
		upload.once("error", reject);
		setTimeout(() => reject(new Error("Upload timed out")), 20_000);
	});
}

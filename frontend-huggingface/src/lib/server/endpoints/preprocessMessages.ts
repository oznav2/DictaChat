import type { Message } from "$lib/types/Message";
import type { EndpointMessage } from "./endpoints";
import { env } from "$env/dynamic/private";
import { downloadFile } from "../files/downloadFile";
import type { ObjectId } from "mongodb";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";

export async function preprocessMessages(
	messages: Message[],
	convId: ObjectId
): Promise<EndpointMessage[]> {
	return Promise.resolve(messages)
		.then((msgs) => downloadFiles(msgs, convId))
		.then((msgs) => injectClipboardFiles(msgs))
		.then(stripEmptyInitialSystemMessage);
}

const LEGACY_UPLOADS_DIR = "/app/uploads";

function resolveUploadsDir(): string {
	if (env.UPLOADS_DIR) return env.UPLOADS_DIR;
	if (env.DOCKER_ENV === "true") return LEGACY_UPLOADS_DIR;
	return join(process.cwd(), ".uploads");
}

const UPLOADS_DIR = resolveUploadsDir();

const DOCLING_MIME_TYPES = new Set([
	"application/pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"application/vnd.ms-powerpoint",
]);

function sanitizeUploadName(name: string): string {
	return (name || "file").replace(/[^a-zA-Z0-9._\-\u0590-\u05FF]/g, "_");
}

function computeUploadPath(convId: ObjectId, sha256: string, originalName: string): string {
	const safeName = sanitizeUploadName(originalName);
	return join(UPLOADS_DIR, convId.toString(), `${sha256.slice(0, 8)}_${safeName}`);
}

function resolveUploadPath(
	convId: ObjectId,
	sha256: string,
	originalName: string,
	existingPath?: string
): string {
	if (
		existingPath &&
		existingPath.startsWith(LEGACY_UPLOADS_DIR) &&
		UPLOADS_DIR !== LEGACY_UPLOADS_DIR
	) {
		return computeUploadPath(convId, sha256, originalName);
	}
	return existingPath ?? computeUploadPath(convId, sha256, originalName);
}

async function ensureFileExistsOnDisk(path: string, base64: string): Promise<void> {
	if (!path) return;
	if (existsSync(path)) return;
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, Buffer.from(base64, "base64"));
}

/**
 * Phase 3.1: Only process files in recent messages to reduce per-turn overhead
 * Old messages in history already had their files processed in previous turns.
 * We process: system message (if any) + last 4 messages (covers user+assistant pairs)
 */
const RECENT_MESSAGES_TO_PROCESS = 4;

async function downloadFiles(messages: Message[], convId: ObjectId): Promise<EndpointMessage[]> {
	// Identify which messages need file processing
	const totalMessages = messages.length;
	const processFromIndex = Math.max(0, totalMessages - RECENT_MESSAGES_TO_PROCESS);

	return Promise.all(
		messages.map<Promise<EndpointMessage>>(async (message, index) => {
			// Skip file processing for old messages (they were processed in previous turns)
			// But always process system message (index 0) if it has files
			const isSystemMessage = index === 0 && message.from === "system";
			const isRecentMessage = index >= processFromIndex;

			if (!isSystemMessage && !isRecentMessage) {
				// Pass through old messages without re-downloading files
				return {
					...message,
					files: message.files?.map((file) => ({
						...file,
						value: file.value, // Keep existing value
						mime: file.mime,
						name: file.name,
						path: file.path,
					})),
				} as EndpointMessage;
			}

			// Process files for recent/system messages
			const files = await Promise.all(
				(message.files ?? []).map(async (file) => {
					const downloaded = await downloadFile(file.value, convId);
					const mime = downloaded.mime ?? file.mime;
					const name = file.name ?? downloaded.name;
					const path = downloaded.path ?? file.path;
					const needsDisk =
						typeof mime === "string" &&
						(DOCLING_MIME_TYPES.has(mime.toLowerCase()) || mime.toLowerCase().startsWith("image/"));

					if (needsDisk) {
						const resolvedPath = resolveUploadPath(convId, file.value, name, path);
						await ensureFileExistsOnDisk(resolvedPath, downloaded.value);
						return { ...downloaded, mime, name, path: resolvedPath };
					}

					return { ...downloaded, mime, name, ...(path ? { path } : {}) };
				})
			);

			return { ...message, files };
		})
	);
}

async function injectClipboardFiles(messages: EndpointMessage[]) {
	return Promise.all(
		messages.map((message) => {
			const plaintextFiles = message.files
				?.filter((file) => file.mime === "application/vnd.chatui.clipboard")
				.map((file) => Buffer.from(file.value, "base64").toString("utf-8"));

			if (!plaintextFiles || plaintextFiles.length === 0) return message;

			return {
				...message,
				content: `${plaintextFiles.join("\n\n")}\n\n${message.content}`,
				files: message.files?.filter((file) => file.mime !== "application/vnd.chatui.clipboard"),
			};
		})
	);
}

/**
 * Remove an initial system message if its content is empty/whitespace only.
 * This prevents sending an empty system prompt to any provider.
 */
function stripEmptyInitialSystemMessage(messages: EndpointMessage[]): EndpointMessage[] {
	if (!messages?.length) return messages;
	const first = messages[0];
	if (first?.from !== "system") return messages;

	const content = first?.content as unknown;
	const isEmpty = typeof content === "string" ? content.trim().length === 0 : false;

	if (isEmpty) {
		return messages.slice(1);
	}

	return messages;
}

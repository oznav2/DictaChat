import type { MessageFile } from "$lib/types/Message";
import type { EndpointMessage } from "$lib/server/endpoints/endpoints";
import type { OpenAI } from "openai";
import { TEXT_MIME_ALLOWLIST } from "$lib/constants/mime";
import type { makeImageProcessor } from "$lib/server/endpoints/images";

/**
 * Prepare chat messages for OpenAI-compatible multimodal payloads.
 * - Processes images via the provided imageProcessor (resize/convert) when multimodal is enabled.
 * - Injects text-file content into the user message text.
 * - Leaves messages untouched when no files or multimodal disabled.
 */
export async function prepareMessagesWithFiles(
	messages: EndpointMessage[],
	imageProcessor: ReturnType<typeof makeImageProcessor>,
	isMultimodal: boolean
): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
	return Promise.all(
		messages.map(async (message) => {
			if (message.from === "user" && message.files && message.files.length > 0) {
				const { imageParts, textContent } = await prepareFiles(
					imageProcessor,
					message.files,
					isMultimodal
				);

				let messageText = message.content;
				if (textContent.length > 0) {
					messageText = textContent + "\n\n" + message.content;
				}

				if (imageParts.length > 0 && isMultimodal) {
					const parts = [{ type: "text" as const, text: messageText }, ...imageParts];
					return { role: message.from, content: parts };
				}

				return { role: message.from, content: messageText };
			}
			return { role: message.from, content: message.content };
		})
	);
}

// MIME types that Docling can process (need file path, not inline content)
const DOCLING_MIME_TYPES = [
	"application/pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
	"application/msword", // doc
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
	"application/vnd.ms-excel", // xls
	"application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
	"application/vnd.ms-powerpoint", // ppt
];

async function prepareFiles(
	imageProcessor: ReturnType<typeof makeImageProcessor>,
	files: MessageFile[],
	isMultimodal: boolean
): Promise<{
	imageParts: OpenAI.Chat.Completions.ChatCompletionContentPartImage[];
	textContent: string;
}> {
	const imageFiles = files.filter((file) => file.mime.startsWith("image/"));

	// Separate Docling-processable files from regular text files
	const doclingFiles = files.filter((file) =>
		DOCLING_MIME_TYPES.includes(file.mime.toLowerCase()) && file.path
	);

	const textFiles = files.filter((file) => {
		const mime = (file.mime || "").toLowerCase();
		// Skip Docling files - they'll be handled separately
		if (DOCLING_MIME_TYPES.includes(mime)) return false;
		const [fileType, fileSubtype] = mime.split("/");
		return TEXT_MIME_ALLOWLIST.some((allowed) => {
			const [type, subtype] = allowed.toLowerCase().split("/");
			const typeOk = type === "*" || type === fileType;
			const subOk = subtype === "*" || subtype === fileSubtype;
			return typeOk && subOk;
		});
	});

	let imageParts: OpenAI.Chat.Completions.ChatCompletionContentPartImage[] = [];
	if (isMultimodal && imageFiles.length > 0) {
		const processedFiles = await Promise.all(imageFiles.map(imageProcessor));
		imageParts = processedFiles.map((file) => ({
			type: "image_url" as const,
			image_url: {
				url: `data:${file.mime};base64,${file.image.toString("base64")}`,
				detail: "auto",
			},
		}));
	}

	let textContent = "";

	// Add Docling file references (path only, content processed by Docling)
	if (doclingFiles.length > 0) {
		const doclingParts = doclingFiles.map((file) =>
			`<attached_file name="${file.name}" type="${file.mime}" path="${file.path}">\nזהו קובץ מצורף. השתמש בכלי docling_convert עם הנתיב: ${file.path}\nThis is an attached file. Use docling_convert tool with path: ${file.path}\n</attached_file>`
		);
		textContent = doclingParts.join("\n\n");
	}

	// Add image file references with paths for OCR
	if (imageFiles.length > 0) {
		const imagePaths = imageFiles
			.filter((file) => file.path)
			.map((file) =>
				`<attached_image name="${file.name}" type="${file.mime}" path="${file.path}">\nלזיהוי טקסט (OCR) השתמש ב-docling_ocr עם הנתיב: ${file.path}\nFor OCR use docling_ocr with path: ${file.path}\n</attached_image>`
			);
		if (imagePaths.length > 0) {
			textContent = textContent + (textContent ? "\n\n" : "") + imagePaths.join("\n\n");
		}
	}

	// Add regular text files (inline content)
	if (textFiles.length > 0) {
		const textParts = await Promise.all(
			textFiles.map(async (file) => {
				const content = Buffer.from(file.value, "base64").toString("utf-8");
				const pathAttr = file.path ? ` path="${file.path}"` : "";
				return `<document name="${file.name}" type="${file.mime}"${pathAttr}>\n${content}\n</document>`;
			})
		);
		textContent = textContent + (textContent ? "\n\n" : "") + textParts.join("\n\n");
	}

	return { imageParts, textContent };
}

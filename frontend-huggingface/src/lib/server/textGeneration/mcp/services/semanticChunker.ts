/**
 * SemanticChunker - Document Chunking Service
 *
 * Splits documents into semantic chunks while preserving context.
 * Handles paragraph boundaries, section headers, lists, and tables.
 * Supports both Hebrew and English text.
 */

import type { ChunkResult, ChunkType } from "../types/documentContext";

export interface ChunkerOptions {
	maxTokens: number;
	overlapTokens?: number;
}

/**
 * SemanticChunker splits text into meaningful chunks
 */
export class SemanticChunker {
	private readonly maxTokens: number;
	private readonly overlapTokens: number;

	constructor(options: ChunkerOptions) {
		this.maxTokens = options.maxTokens;
		this.overlapTokens = options.overlapTokens ?? 50;
	}

	/**
	 * Chunk text into semantic segments
	 */
	async chunk(text: string): Promise<ChunkResult[]> {
		const chunks: ChunkResult[] = [];

		// Split by semantic boundaries (sections)
		const sections = this.splitBySections(text);

		for (const section of sections) {
			const sectionTokens = this.estimateTokens(section.content);

			if (sectionTokens <= this.maxTokens) {
				// Section fits in one chunk
				chunks.push({
					content: section.content.trim(),
					tokenCount: sectionTokens,
					sectionTitle: section.title,
					type: section.type,
				});
			} else {
				// Split large sections by paragraphs
				const paragraphChunks = this.splitByParagraphs(section);
				chunks.push(...paragraphChunks);
			}
		}

		return chunks.filter((c) => c.content.length > 0);
	}

	/**
	 * Split text by section headers
	 */
	private splitBySections(
		text: string
	): Array<{ content: string; title?: string; type: ChunkType }> {
		// Pattern for markdown headers, numbered sections, bold headers
		const sectionRegex = /^(#{1,3}\s+.+|[0-9]+\.\s+.+|\*\*[^*]+\*\*\s*$)/gm;
		const sections: Array<{ content: string; title?: string; type: ChunkType }> = [];

		let lastIndex = 0;
		let lastTitle: string | undefined;
		let match;

		while ((match = sectionRegex.exec(text)) !== null) {
			if (match.index > lastIndex) {
				const content = text.slice(lastIndex, match.index);
				if (content.trim()) {
					sections.push({
						content: content.trim(),
						title: lastTitle,
						type: this.detectType(content),
					});
				}
			}
			lastTitle = match[1]
				.replace(/^#+\s*/, "")
				.replace(/\*\*/g, "")
				.trim();
			lastIndex = match.index + match[0].length;
		}

		// Remaining content after last header
		if (lastIndex < text.length) {
			const content = text.slice(lastIndex);
			if (content.trim()) {
				sections.push({
					content: content.trim(),
					title: lastTitle,
					type: this.detectType(content),
				});
			}
		}

		// If no sections found, return entire text as one section
		return sections.length > 0 ? sections : [{ content: text, type: "paragraph" }];
	}

	/**
	 * Split section by paragraphs when it's too large
	 */
	private splitByParagraphs(section: {
		content: string;
		title?: string;
		type: ChunkType;
	}): ChunkResult[] {
		const chunks: ChunkResult[] = [];
		const paragraphs = section.content.split(/\n\s*\n/).filter((p) => p.trim());

		for (const para of paragraphs) {
			const paraTokens = this.estimateTokens(para);

			if (paraTokens <= this.maxTokens) {
				chunks.push({
					content: para.trim(),
					tokenCount: paraTokens,
					sectionTitle: section.title,
					type: this.detectType(para),
				});
			} else {
				// Paragraph too large, split by sentences
				const sentenceChunks = this.splitBySentences(para, section.title);
				chunks.push(...sentenceChunks);
			}
		}

		return chunks;
	}

	/**
	 * Split by sentences as last resort for very long paragraphs
	 */
	private splitBySentences(text: string, sectionTitle?: string): ChunkResult[] {
		const chunks: ChunkResult[] = [];

		// Handle Hebrew and English sentence boundaries
		// Hebrew: ends with . ! ? or Hebrew punctuation
		// English: standard sentence endings
		const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());

		let buffer = "";
		let bufferTokens = 0;

		for (const sentence of sentences) {
			const sentenceTokens = this.estimateTokens(sentence);

			if (bufferTokens + sentenceTokens <= this.maxTokens) {
				buffer += (buffer ? " " : "") + sentence;
				bufferTokens += sentenceTokens;
			} else {
				// Save current buffer if not empty
				if (buffer.trim()) {
					chunks.push({
						content: buffer.trim(),
						tokenCount: bufferTokens,
						sectionTitle,
						type: "paragraph",
					});
				}

				// Handle sentence that exceeds max tokens on its own
				if (sentenceTokens > this.maxTokens) {
					// Force split by words
					const wordChunks = this.splitByWords(sentence, sectionTitle);
					chunks.push(...wordChunks);
					buffer = "";
					bufferTokens = 0;
				} else {
					buffer = sentence;
					bufferTokens = sentenceTokens;
				}
			}
		}

		// Don't forget remaining buffer
		if (buffer.trim()) {
			chunks.push({
				content: buffer.trim(),
				tokenCount: bufferTokens,
				sectionTitle,
				type: "paragraph",
			});
		}

		return chunks;
	}

	/**
	 * Last resort: split by words for extremely long sentences
	 */
	private splitByWords(text: string, sectionTitle?: string): ChunkResult[] {
		const chunks: ChunkResult[] = [];
		const words = text.split(/\s+/);

		let buffer = "";
		let bufferTokens = 0;

		for (const word of words) {
			const wordTokens = this.estimateTokens(word);

			if (bufferTokens + wordTokens <= this.maxTokens) {
				buffer += (buffer ? " " : "") + word;
				bufferTokens += wordTokens;
			} else {
				if (buffer.trim()) {
					chunks.push({
						content: buffer.trim(),
						tokenCount: bufferTokens,
						sectionTitle,
						type: "paragraph",
					});
				}
				buffer = word;
				bufferTokens = wordTokens;
			}
		}

		if (buffer.trim()) {
			chunks.push({
				content: buffer.trim(),
				tokenCount: bufferTokens,
				sectionTitle,
				type: "paragraph",
			});
		}

		return chunks;
	}

	/**
	 * Detect chunk type based on content patterns
	 */
	private detectType(content: string): ChunkType {
		// Table detection (markdown tables)
		if (/^\|.+\|$/m.test(content)) {
			return "table";
		}

		// List detection (bullet points or numbered)
		if (/^[-*•]\s+/m.test(content) || /^\d+[.)]\s+/m.test(content)) {
			return "list";
		}

		// Citation detection
		if (/\[\d+\]|\(\d{4}\)|ibid\.|supra|infra/i.test(content)) {
			return "citation";
		}

		// Code block detection
		if (/```[\s\S]*```/m.test(content) || /^ {4}/m.test(content)) {
			return "code";
		}

		// Header detection (short, starts with capital/Hebrew letter)
		if (content.length < 100 && /^[A-Z\u0590-\u05FF]/.test(content)) {
			return "header";
		}

		return "paragraph";
	}

	/**
	 * Estimate token count for text
	 * Rough estimate: 1 token ≈ 4 characters for English, 2 for Hebrew
	 */
	estimateTokens(text: string): number {
		const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
		const otherChars = text.length - hebrewChars;

		// Hebrew characters are denser (fewer chars per token)
		// English: ~4 chars/token, Hebrew: ~2 chars/token
		return Math.ceil(hebrewChars / 2 + otherChars / 4);
	}

	/**
	 * Detect dominant language of text
	 */
	detectLanguage(text: string): "he" | "en" | "mixed" {
		const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
		const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
		const total = hebrewChars + englishChars;

		if (total === 0) return "en";

		const hebrewRatio = hebrewChars / total;

		if (hebrewRatio > 0.7) return "he";
		if (hebrewRatio < 0.3) return "en";
		return "mixed";
	}
}

/**
 * Factory function with default options
 */
export function createSemanticChunker(maxTokens = 800, overlapTokens = 50): SemanticChunker {
	return new SemanticChunker({ maxTokens, overlapTokens });
}

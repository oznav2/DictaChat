/**
 * Docling Client - Document Text Extraction
 *
 * Calls the Docling service to extract text from PDFs and other documents.
 */

import { env } from "$env/dynamic/private";
import { readFile } from "fs/promises";
import { basename } from "path";

export interface DoclingConfig {
  endpoint?: string;
  timeout?: number;
}

export interface DoclingExtractResult {
  text: string;
  pages?: number;
  format?: string;
}

const DEFAULT_CONFIG: DoclingConfig = {
  endpoint: env.DOCLING_SERVER_URL || "http://docling:5001",
  timeout: 120000 // 2 minutes for large documents
};

/**
 * Extract text from a document using Docling
 */
export async function extractDocumentText(
  filePath: string,
  config?: DoclingConfig
): Promise<DoclingExtractResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const endpoint = `${cfg.endpoint}/v1/convert/file`;

  try {
    // Read the file
    const fileBuffer = await readFile(filePath);
    const fileName = basename(filePath);

    // Create form data
    const formData = new FormData();
    formData.append("files", new Blob([fileBuffer]), fileName);

    // Call Docling
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(cfg.timeout || 120000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Docling extraction failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    // Extract markdown text from Docling response
    // Docling returns { documents: [{ md_content: "...", ... }] }
    let extractedText = "";

    if (result.documents && Array.isArray(result.documents)) {
      for (const doc of result.documents) {
        if (doc.md_content) {
          extractedText += doc.md_content + "\n\n";
        } else if (doc.text) {
          extractedText += doc.text + "\n\n";
        }
      }
    } else if (result.md_content) {
      extractedText = result.md_content;
    } else if (result.text) {
      extractedText = result.text;
    }

    return {
      text: extractedText.trim(),
      pages: result.documents?.[0]?.num_pages,
      format: result.documents?.[0]?.input_format
    };
  } catch (error) {
    if (error instanceof Error) {
      console.error("[Docling] Extraction error:", error.message);
    }
    throw error;
  }
}

/**
 * Create a Docling client with custom config
 */
export function createDoclingClient(config?: DoclingConfig) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return {
    extract: (filePath: string) => extractDocumentText(filePath, cfg)
  };
}

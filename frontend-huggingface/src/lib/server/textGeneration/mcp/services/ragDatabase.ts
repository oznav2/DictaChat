/**
 * RAG Database Helper
 *
 * Integrates with the existing Database singleton to provide
 * MongoClient access for the RAG system.
 */

import type { MongoClient } from "mongodb";
import { Database } from "$lib/server/database";
import { DocumentContextStore, createDocumentContextStore } from "../stores/documentContextStore";
import { logger } from "$lib/server/logger";

let ragStoreInstance: DocumentContextStore | null = null;
let indexesInitialized = false;

/**
 * Get the MongoClient from the existing database singleton
 */
export async function getMongoClient(): Promise<MongoClient> {
  const db = await Database.getInstance();
  return db.getClient();
}

/**
 * Get or create the DocumentContextStore singleton
 */
export async function getDocumentContextStore(): Promise<DocumentContextStore> {
  if (!ragStoreInstance) {
    const client = await getMongoClient();
    ragStoreInstance = createDocumentContextStore(client);

    // Initialize indexes on first access
    if (!indexesInitialized) {
      try {
        await ragStoreInstance.initializeIndexes();
        indexesInitialized = true;
        logger.info("RAG document context indexes initialized");
      } catch (error) {
        logger.error(error, "Failed to initialize RAG indexes");
      }
    }
  }

  return ragStoreInstance;
}

/**
 * Check if RAG database is ready
 */
export async function isRAGDatabaseReady(): Promise<boolean> {
  try {
    const client = await getMongoClient();
    await client.db().admin().ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset the store instance (for testing)
 */
export function resetRAGStore(): void {
  ragStoreInstance = null;
  indexesInitialized = false;
}

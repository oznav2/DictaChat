# RAG Trace Panel Implementation Plan

## Enterprise Document Context System with Real-Time Progress Streaming

**Status:** Awaiting Approval
**Created:** 2025-12-30
**Scope:** Backend + Frontend + Storage
**Risk Level:** Medium (modifies core MCP flow)

---

## Executive Summary

This plan implements an intelligent **Document Context RAG System** that:
1. Caches processed document content in MongoDB with vector embeddings
2. Uses semantic search + reranking for follow-up questions
3. Streams real-time progress via **Run Trace** architecture
4. Displays beautiful step-by-step UI in Svelte with Tailwind animations
5. Supports Hebrew-first UX with bilingual step labels

### Key Principles
- **No breaking changes** - Existing MCP flow remains intact
- **Additive architecture** - New services wrap existing functionality
- **Graceful degradation** - Falls back to current behavior if RAG fails
- **Backend-driven events** - No LLM-hallucinated UI steps

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Data Models & Schemas](#2-data-models--schemas)
3. [Backend Implementation](#3-backend-implementation)
4. [Frontend Implementation](#4-frontend-implementation)
5. [Streaming Protocol](#5-streaming-protocol)
6. [Integration Points](#6-integration-points)
7. [Migration Strategy](#7-migration-strategy)
8. [Testing Plan](#8-testing-plan)
9. [Rollback Plan](#9-rollback-plan)
10. [File Change Summary](#10-file-change-summary)

---

## 1. Architecture Overview

### 1.1 System Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              USER UPLOADS DOCUMENT                               │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1: INGESTION (Background, Streamed Progress)                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐         │
│  │ Docling MCP │──►│ Chunking    │──►│ Embedding   │──►│ MongoDB     │         │
│  │ Extract     │   │ Semantic    │   │ Service     │   │ Store       │         │
│  │ (5001)      │   │ Paragraphs  │   │ (5005)      │   │ Vectors     │         │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘         │
│         │                 │                 │                 │                 │
│         ▼                 ▼                 ▼                 ▼                 │
│  trace.step ────► trace.step ────► trace.step ────► trace.step                 │
│  "Extracting"    "Chunking"       "Embedding"       "Stored"                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2: USER QUERY (Follow-up Questions)                                      │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │ TIER 1: Semantic Search + Reranker                                       │    │
│  │ ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                     │    │
│  │ │ Embed Query │──►│ Vector      │──►│ Reranker    │──► Score ≥ 0.7?     │    │
│  │ │ (5005)      │   │ Search      │   │ (5006)      │         │           │    │
│  │ └─────────────┘   └─────────────┘   └─────────────┘         │           │    │
│  └─────────────────────────────────────────────────────────────┼───────────┘    │
│                                                                 │                │
│                              ┌──────────────────────────────────┘                │
│                              │                                                   │
│                         YES ─┴─ NO                                               │
│                          │      │                                                │
│                          ▼      ▼                                                │
│  ┌───────────────────────┐   ┌───────────────────────────────────────────────┐  │
│  │ Answer from Context   │   │ TIER 2: LLM Self-Assessment                   │  │
│  │ (No tool call needed) │   │ "Can you answer from this context?"           │  │
│  └───────────────────────┘   │         │                                      │  │
│                              │    YES ─┴─ NO                                  │  │
│                              │     │      │                                   │  │
│                              │     ▼      ▼                                   │  │
│                              │  Answer   TIER 3: Docling MCP                  │  │
│                              │           (Augment context, don't replace)     │  │
│                              └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Token Budget Allocation (32K Context)

```
┌────────────────────────────────────────────────────────────┐
│ CONTEXT WINDOW BUDGET (32,768 tokens)                      │
├────────────────────────────────────────────────────────────┤
│ System Prompt           │  1,500 tokens  │   4.6%         │
│ User Context (persona)  │    200 tokens  │   0.6%         │
│ Retrieved Chunks        │  8,000 tokens  │  24.4%         │
│ Conversation History    │  4,000 tokens  │  12.2%         │
│ Response Buffer         │ 18,000 tokens  │  55.0%         │
│ Safety Margin           │  1,068 tokens  │   3.2%         │
└────────────────────────────────────────────────────────────┘
```

### 1.3 Component Responsibilities

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `DocumentRAGService` | `mcp/services/documentRAG.ts` | Orchestrates ingestion, retrieval, caching |
| `TraceEmitter` | `mcp/services/traceEmitter.ts` | Streams step events via SSE |
| `SemanticChunker` | `mcp/services/semanticChunker.ts` | Paragraph-aware document splitting |
| `EmbeddingClient` | `mcp/services/embeddingClient.ts` | Calls embedding service (5005) |
| `RerankerClient` | `mcp/services/rerankerClient.ts` | Calls reranker service (5006) |
| `DocumentContextStore` | `mcp/stores/documentContextStore.ts` | MongoDB CRUD operations |
| `TracePanel.svelte` | `components/TracePanel.svelte` | Step-by-step UI component |

---

## 2. Data Models & Schemas

### 2.1 MongoDB Collections

#### Collection: `document_contexts`

```typescript
interface DocumentContext {
  _id: ObjectId;

  // Identity
  conversationId: string;          // Links to chat session
  documentHash: string;            // SHA-256 of file content
  fileName: string;
  mimeType: string;

  // Metadata (for retrieval, NOT injected to LLM)
  metadata: {
    classification: string;        // "legal", "financial", "technical", etc.
    subject: string;               // Main topic
    keywords: {
      hebrew: string[];
      english: string[];
    };
    citations: string[];
    datePublished?: Date;
    source?: string;
    authors: string[];
    language: "he" | "en" | "mixed";
    extractedAt: Date;
  };

  // User Context (compact, injected to LLM)
  userContext: {
    profession?: string;           // "Israeli lawyer"
    expertiseLevel?: string;       // "expert", "beginner"
    preferredLanguage: "he" | "en";
    customContext: string[];       // Other extracted preferences
  };

  // Chunks (stored separately, linked by documentId)
  chunkCount: number;
  totalTokens: number;

  // Lifecycle
  createdAt: Date;
  lastAccessedAt: Date;
  augmentationHistory: Array<{
    timestamp: Date;
    reason: string;
    chunksAdded: number;
  }>;
}
```

#### Collection: `document_chunks`

```typescript
interface DocumentChunk {
  _id: ObjectId;
  documentId: ObjectId;            // Reference to document_contexts
  conversationId: string;

  // Content
  content: string;                 // The actual text chunk
  chunkIndex: number;              // Order in document
  tokenCount: number;

  // Semantic info
  sectionTitle?: string;           // Extracted section header
  chunkType: "paragraph" | "table" | "list" | "header" | "citation";

  // Vector embedding (for semantic search)
  embedding: number[];             // 1024-dim vector from dicta-retrieval

  // Retrieval stats
  retrievalCount: number;
  lastRetrievedAt?: Date;
  averageRerankerScore: number;
}
```

#### Collection: `conversation_memory`

```typescript
interface ConversationMemory {
  _id: ObjectId;
  conversationId: string;

  // Accumulated context from assistant responses
  learnedFacts: Array<{
    fact: string;
    source: "document" | "user" | "inference";
    confidence: number;
    addedAt: Date;
  }>;

  // Query history for context
  queryHistory: Array<{
    query: string;
    language: "he" | "en";
    answeredFromCache: boolean;
    timestamp: Date;
  }>;
}
```

### 2.2 Trace Event Schema

```typescript
// Run lifecycle
interface RunCreatedEvent {
  type: "run.created";
  runId: string;
  conversationId: string;
  timestamp: number;
}

interface RunCompletedEvent {
  type: "run.completed";
  runId: string;
  timestamp: number;
}

// Step lifecycle
interface StepCreatedEvent {
  type: "step.created";
  runId: string;
  step: TraceStep;
}

interface StepStatusEvent {
  type: "step.status";
  runId: string;
  stepId: string;
  status: "queued" | "running" | "done" | "error";
  timestamp: number;
}

interface StepDetailEvent {
  type: "step.detail";
  runId: string;
  stepId: string;
  detail: string;                  // Additional info (e.g., "Found 12 chunks")
}

// Step definition
interface TraceStep {
  id: string;
  parentId: string | null;         // For hierarchy
  label: {
    he: string;
    en: string;
  };
  status: "queued" | "running" | "done" | "error";
  detail?: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

// Assistant content (interleaved with trace)
interface AssistantDeltaEvent {
  type: "assistant.delta";
  runId: string;
  content: string;                 // Token chunk
}
```

### 2.3 Predefined Step Labels (Bilingual)

```typescript
const TRACE_STEPS = {
  // Ingestion Phase
  UNDERSTANDING_REQUEST: {
    id: "understanding",
    label: { he: "מבין את הבקשה שלך", en: "Understanding your request" }
  },
  EXTRACTING_DOCUMENT: {
    id: "extracting",
    label: { he: "מחלץ טקסט מהמסמך", en: "Extracting text from document" }
  },
  CHUNKING_CONTENT: {
    id: "chunking",
    label: { he: "מפצל לקטעים סמנטיים", en: "Splitting into semantic chunks" }
  },
  GENERATING_EMBEDDINGS: {
    id: "embedding",
    label: { he: "יוצר וקטורים סמנטיים", en: "Generating embeddings" }
  },
  EXTRACTING_METADATA: {
    id: "metadata",
    label: { he: "מזהה מטא-דאטה ומילות מפתח", en: "Extracting metadata and keywords" }
  },
  STORING_CONTEXT: {
    id: "storing",
    label: { he: "שומר בזיכרון ארוך טווח", en: "Storing in long-term memory" }
  },

  // Retrieval Phase
  SEARCHING_KNOWLEDGE: {
    id: "searching",
    label: { he: "מחפש בבסיס הידע", en: "Searching knowledge base" }
  },
  RANKING_RESULTS: {
    id: "ranking",
    label: { he: "מדרג תוצאות לפי רלוונטיות", en: "Ranking results by relevance" }
  },
  ASSESSING_CONTEXT: {
    id: "assessing",
    label: { he: "בודק אם ההקשר מספיק", en: "Assessing if context is sufficient" }
  },
  AUGMENTING_CONTEXT: {
    id: "augmenting",
    label: { he: "מעשיר את ההקשר במידע נוסף", en: "Augmenting context with more info" }
  },

  // Tool Usage
  USING_TOOL: {
    id: "tool",
    label: { he: "משתמש בכלי", en: "Using tool" }
  },
  READING_FILE: {
    id: "read_file",
    label: { he: "קורא קובץ", en: "Reading file" }
  },

  // Completion
  GENERATING_RESPONSE: {
    id: "generating",
    label: { he: "מכין תשובה", en: "Generating response" }
  },
  PROCESS_COMPLETE: {
    id: "complete",
    label: { he: "התהליך הושלם", en: "Process complete" }
  }
} as const;
```

---

## 3. Backend Implementation

### 3.1 New Files to Create

#### 3.1.1 `documentRAG.ts` - Main Orchestrator

```typescript
// Location: frontend-huggingface/src/lib/server/textGeneration/mcp/services/documentRAG.ts

import { TraceEmitter } from "./traceEmitter";
import { SemanticChunker } from "./semanticChunker";
import { EmbeddingClient } from "./embeddingClient";
import { RerankerClient } from "./rerankerClient";
import { DocumentContextStore } from "../stores/documentContextStore";

export class DocumentRAGService {
  private traceEmitter: TraceEmitter;
  private chunker: SemanticChunker;
  private embedder: EmbeddingClient;
  private reranker: RerankerClient;
  private store: DocumentContextStore;

  // Configuration
  private readonly RERANKER_THRESHOLD = 0.7;
  private readonly MAX_CHUNKS_TO_INJECT = 10;
  private readonly MAX_CHUNK_TOKENS = 800;
  private readonly TOTAL_CONTEXT_BUDGET = 8000;

  constructor(deps: DocumentRAGDependencies) {
    this.traceEmitter = deps.traceEmitter;
    this.chunker = new SemanticChunker({ maxTokens: this.MAX_CHUNK_TOKENS });
    this.embedder = new EmbeddingClient({ endpoint: "http://localhost:5005" });
    this.reranker = new RerankerClient({ endpoint: "http://localhost:5006" });
    this.store = new DocumentContextStore(deps.mongoClient);
  }

  /**
   * PHASE 1: Ingest document (background, with streaming progress)
   */
  async ingestDocument(params: IngestParams): Promise<DocumentContext> {
    const { runId, conversationId, filePath, fileName, mimeType, userQuery } = params;
    const language = this.detectLanguage(userQuery);

    // Step 1: Extract text via Docling
    this.traceEmitter.stepStart(runId, TRACE_STEPS.EXTRACTING_DOCUMENT, language);
    const rawText = await this.extractWithDocling(filePath, mimeType);
    this.traceEmitter.stepDone(runId, TRACE_STEPS.EXTRACTING_DOCUMENT.id);

    // Step 2: Semantic chunking
    this.traceEmitter.stepStart(runId, TRACE_STEPS.CHUNKING_CONTENT, language);
    const chunks = await this.chunker.chunk(rawText);
    this.traceEmitter.stepDetail(runId, TRACE_STEPS.CHUNKING_CONTENT.id,
      language === "he" ? `${chunks.length} קטעים` : `${chunks.length} chunks`);
    this.traceEmitter.stepDone(runId, TRACE_STEPS.CHUNKING_CONTENT.id);

    // Step 3: Generate embeddings
    this.traceEmitter.stepStart(runId, TRACE_STEPS.GENERATING_EMBEDDINGS, language);
    const embeddings = await this.embedder.embedBatch(chunks.map(c => c.content));
    this.traceEmitter.stepDone(runId, TRACE_STEPS.GENERATING_EMBEDDINGS.id);

    // Step 4: Extract metadata (LLM-based, separate from context)
    this.traceEmitter.stepStart(runId, TRACE_STEPS.EXTRACTING_METADATA, language);
    const metadata = await this.extractMetadata(rawText, language);
    this.traceEmitter.stepDone(runId, TRACE_STEPS.EXTRACTING_METADATA.id);

    // Step 5: Extract user context from query
    const userContext = await this.extractUserContext(userQuery, language);

    // Step 6: Store in MongoDB
    this.traceEmitter.stepStart(runId, TRACE_STEPS.STORING_CONTEXT, language);
    const docContext = await this.store.createDocumentContext({
      conversationId,
      documentHash: this.hashContent(rawText),
      fileName,
      mimeType,
      metadata,
      userContext,
      chunkCount: chunks.length,
      totalTokens: chunks.reduce((sum, c) => sum + c.tokenCount, 0)
    });

    await this.store.createChunks(
      chunks.map((chunk, idx) => ({
        documentId: docContext._id,
        conversationId,
        content: chunk.content,
        chunkIndex: idx,
        tokenCount: chunk.tokenCount,
        sectionTitle: chunk.sectionTitle,
        chunkType: chunk.type,
        embedding: embeddings[idx]
      }))
    );
    this.traceEmitter.stepDone(runId, TRACE_STEPS.STORING_CONTEXT.id);

    return docContext;
  }

  /**
   * PHASE 2: Retrieve relevant context for follow-up query
   */
  async retrieveContext(params: RetrieveParams): Promise<RetrievalResult> {
    const { runId, conversationId, query } = params;
    const language = this.detectLanguage(query);

    // Check if document context exists for this conversation
    const docContext = await this.store.getDocumentContext(conversationId);
    if (!docContext) {
      return { hasContext: false, chunks: [], needsToolCall: true };
    }

    // TIER 1: Semantic search + reranking
    this.traceEmitter.stepStart(runId, TRACE_STEPS.SEARCHING_KNOWLEDGE, language);
    const queryEmbedding = await this.embedder.embed(query);
    const candidates = await this.store.vectorSearch(conversationId, queryEmbedding, 20);
    this.traceEmitter.stepDone(runId, TRACE_STEPS.SEARCHING_KNOWLEDGE.id);

    this.traceEmitter.stepStart(runId, TRACE_STEPS.RANKING_RESULTS, language);
    const ranked = await this.reranker.rerank(query, candidates.map(c => c.content));
    const topChunks = ranked
      .filter(r => r.score >= this.RERANKER_THRESHOLD)
      .slice(0, this.MAX_CHUNKS_TO_INJECT);
    this.traceEmitter.stepDetail(runId, TRACE_STEPS.RANKING_RESULTS.id,
      language === "he"
        ? `${topChunks.length} קטעים רלוונטיים (ציון > 0.7)`
        : `${topChunks.length} relevant chunks (score > 0.7)`);
    this.traceEmitter.stepDone(runId, TRACE_STEPS.RANKING_RESULTS.id);

    // If high-confidence results found
    if (topChunks.length > 0) {
      // Update retrieval stats
      await this.store.updateRetrievalStats(topChunks.map(c => c.chunkId));

      return {
        hasContext: true,
        chunks: topChunks,
        userContext: docContext.userContext,
        needsToolCall: false,
        tier: 1
      };
    }

    // TIER 2: LLM self-assessment (will be handled in runMcpFlow)
    this.traceEmitter.stepStart(runId, TRACE_STEPS.ASSESSING_CONTEXT, language);
    // Return partial context for LLM to assess
    const allChunks = ranked.slice(0, this.MAX_CHUNKS_TO_INJECT);

    return {
      hasContext: true,
      chunks: allChunks,
      userContext: docContext.userContext,
      needsToolCall: false,  // Let LLM decide
      tier: 2,
      requiresAssessment: true
    };
  }

  /**
   * TIER 3: Augment context with additional Docling call
   */
  async augmentContext(params: AugmentParams): Promise<void> {
    const { runId, conversationId, query, filePath } = params;
    const language = this.detectLanguage(query);

    this.traceEmitter.stepStart(runId, TRACE_STEPS.AUGMENTING_CONTEXT, language);

    // Extract additional content focused on query
    const additionalText = await this.extractWithDocling(filePath, "application/pdf", {
      focusQuery: query  // Hint for targeted extraction
    });

    // Chunk and embed new content
    const newChunks = await this.chunker.chunk(additionalText);
    const newEmbeddings = await this.embedder.embedBatch(newChunks.map(c => c.content));

    // Get existing document
    const docContext = await this.store.getDocumentContext(conversationId);

    // Append (not replace!) new chunks
    await this.store.appendChunks(
      docContext._id,
      newChunks.map((chunk, idx) => ({
        documentId: docContext._id,
        conversationId,
        content: chunk.content,
        chunkIndex: docContext.chunkCount + idx,
        tokenCount: chunk.tokenCount,
        sectionTitle: chunk.sectionTitle,
        chunkType: chunk.type,
        embedding: newEmbeddings[idx]
      }))
    );

    // Record augmentation
    await this.store.recordAugmentation(docContext._id, {
      timestamp: new Date(),
      reason: query,
      chunksAdded: newChunks.length
    });

    this.traceEmitter.stepDone(runId, TRACE_STEPS.AUGMENTING_CONTEXT.id);
  }

  /**
   * Build context injection string for LLM
   */
  buildContextInjection(result: RetrievalResult): string {
    if (!result.hasContext || result.chunks.length === 0) {
      return "";
    }

    let injection = "<document_context>\n";

    // User context (compact)
    if (result.userContext) {
      const uc = result.userContext;
      if (uc.profession) injection += `User profession: ${uc.profession}\n`;
      if (uc.preferredLanguage) injection += `Preferred language: ${uc.preferredLanguage}\n`;
    }

    injection += "\n<retrieved_chunks>\n";

    let tokenCount = 0;
    for (const chunk of result.chunks) {
      if (tokenCount + chunk.tokenCount > this.TOTAL_CONTEXT_BUDGET) break;
      injection += `[Chunk ${chunk.chunkIndex}${chunk.sectionTitle ? ` - ${chunk.sectionTitle}` : ""}]\n`;
      injection += chunk.content + "\n\n";
      tokenCount += chunk.tokenCount;
    }

    injection += "</retrieved_chunks>\n</document_context>";

    return injection;
  }

  // Helper methods...
  private detectLanguage(text: string): "he" | "en" {
    const hebrewRegex = /[\u0590-\u05FF]/;
    const hebrewChars = (text.match(hebrewRegex) || []).length;
    return hebrewChars > text.length * 0.1 ? "he" : "en";
  }

  private async extractMetadata(text: string, lang: "he" | "en"): Promise<DocumentMetadata> {
    // LLM-based extraction - runs separately, not in context
    // Implementation uses small inference call
  }

  private async extractUserContext(query: string, lang: "he" | "en"): Promise<UserContext> {
    // Extract persona, preferences from query
  }

  private hashContent(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }
}
```

#### 3.1.2 `traceEmitter.ts` - SSE Event Streaming

```typescript
// Location: frontend-huggingface/src/lib/server/textGeneration/mcp/services/traceEmitter.ts

import { v4 as uuidv4 } from "uuid";
import type { TraceStep, TraceEvent } from "../types/trace";
import { TRACE_STEPS } from "../constants/traceSteps";

export class TraceEmitter {
  private runId: string | null = null;
  private steps: Map<string, TraceStep> = new Map();
  private eventQueue: TraceEvent[] = [];
  private subscribers: Set<(event: TraceEvent) => void> = new Set();
  private language: "he" | "en" = "en";

  /**
   * Start a new run
   */
  startRun(conversationId: string): string {
    this.runId = uuidv4();
    this.steps.clear();
    this.eventQueue = [];

    this.emit({
      type: "run.created",
      runId: this.runId,
      conversationId,
      timestamp: Date.now()
    });

    return this.runId;
  }

  /**
   * Set language for step labels
   */
  setLanguage(lang: "he" | "en"): void {
    this.language = lang;
  }

  /**
   * Start a step
   */
  stepStart(
    runId: string,
    stepDef: { id: string; label: { he: string; en: string } },
    language?: "he" | "en",
    parentId?: string
  ): string {
    const lang = language || this.language;
    const step: TraceStep = {
      id: `${stepDef.id}-${Date.now()}`,
      parentId: parentId || null,
      label: stepDef.label,
      status: "running",
      timestamp: Date.now()
    };

    this.steps.set(step.id, step);

    this.emit({
      type: "step.created",
      runId,
      step
    });

    return step.id;
  }

  /**
   * Update step status
   */
  stepDone(runId: string, stepId: string): void {
    this.updateStepStatus(runId, stepId, "done");
  }

  stepError(runId: string, stepId: string): void {
    this.updateStepStatus(runId, stepId, "error");
  }

  private updateStepStatus(
    runId: string,
    stepId: string,
    status: "done" | "error"
  ): void {
    // Find step by prefix (since we append timestamp)
    const fullStepId = Array.from(this.steps.keys())
      .find(k => k.startsWith(stepId));

    if (fullStepId) {
      const step = this.steps.get(fullStepId)!;
      step.status = status;

      this.emit({
        type: "step.status",
        runId,
        stepId: fullStepId,
        status,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Add detail to step
   */
  stepDetail(runId: string, stepId: string, detail: string): void {
    const fullStepId = Array.from(this.steps.keys())
      .find(k => k.startsWith(stepId));

    if (fullStepId) {
      this.emit({
        type: "step.detail",
        runId,
        stepId: fullStepId,
        detail
      });
    }
  }

  /**
   * Stream assistant token
   */
  assistantDelta(runId: string, content: string): void {
    this.emit({
      type: "assistant.delta",
      runId,
      content
    });
  }

  /**
   * Complete run
   */
  completeRun(runId: string): void {
    this.emit({
      type: "run.completed",
      runId,
      timestamp: Date.now()
    });
  }

  /**
   * Subscribe to events
   */
  subscribe(callback: (event: TraceEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Emit event to all subscribers
   */
  private emit(event: TraceEvent): void {
    this.eventQueue.push(event);
    this.subscribers.forEach(cb => cb(event));
  }

  /**
   * Create async iterator for SSE streaming
   */
  async *stream(): AsyncGenerator<TraceEvent> {
    // Yield any queued events
    for (const event of this.eventQueue) {
      yield event;
    }

    // Then yield new events as they come
    const queue: TraceEvent[] = [];
    let resolve: (() => void) | null = null;

    const unsubscribe = this.subscribe(event => {
      queue.push(event);
      if (resolve) {
        resolve();
        resolve = null;
      }
    });

    try {
      while (true) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          await new Promise<void>(r => { resolve = r; });
        }
      }
    } finally {
      unsubscribe();
    }
  }
}
```

#### 3.1.3 `semanticChunker.ts` - Document Chunking

```typescript
// Location: frontend-huggingface/src/lib/server/textGeneration/mcp/services/semanticChunker.ts

export interface ChunkResult {
  content: string;
  tokenCount: number;
  sectionTitle?: string;
  type: "paragraph" | "table" | "list" | "header" | "citation";
}

export class SemanticChunker {
  private readonly maxTokens: number;

  constructor(options: { maxTokens: number }) {
    this.maxTokens = options.maxTokens;
  }

  async chunk(text: string): Promise<ChunkResult[]> {
    const chunks: ChunkResult[] = [];

    // Split by semantic boundaries
    const sections = this.splitBySections(text);

    for (const section of sections) {
      if (this.estimateTokens(section.content) <= this.maxTokens) {
        chunks.push({
          content: section.content.trim(),
          tokenCount: this.estimateTokens(section.content),
          sectionTitle: section.title,
          type: section.type
        });
      } else {
        // Split large sections by paragraphs
        const paragraphs = this.splitByParagraphs(section.content);
        for (const para of paragraphs) {
          if (this.estimateTokens(para) <= this.maxTokens) {
            chunks.push({
              content: para.trim(),
              tokenCount: this.estimateTokens(para),
              sectionTitle: section.title,
              type: "paragraph"
            });
          } else {
            // Last resort: sentence-level splitting
            const sentences = this.splitBySentences(para);
            let buffer = "";
            for (const sentence of sentences) {
              if (this.estimateTokens(buffer + sentence) <= this.maxTokens) {
                buffer += sentence + " ";
              } else {
                if (buffer.trim()) {
                  chunks.push({
                    content: buffer.trim(),
                    tokenCount: this.estimateTokens(buffer),
                    sectionTitle: section.title,
                    type: "paragraph"
                  });
                }
                buffer = sentence + " ";
              }
            }
            if (buffer.trim()) {
              chunks.push({
                content: buffer.trim(),
                tokenCount: this.estimateTokens(buffer),
                sectionTitle: section.title,
                type: "paragraph"
              });
            }
          }
        }
      }
    }

    return chunks;
  }

  private splitBySections(text: string): Array<{ content: string; title?: string; type: ChunkResult["type"] }> {
    // Detect markdown headers, numbered sections, etc.
    const sectionRegex = /^(#{1,3}\s+.+|[0-9]+\.\s+.+|\*\*[^*]+\*\*\s*$)/gm;
    const sections: Array<{ content: string; title?: string; type: ChunkResult["type"] }> = [];

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
            type: this.detectType(content)
          });
        }
      }
      lastTitle = match[1].replace(/^#+\s*/, "").replace(/\*\*/g, "").trim();
      lastIndex = match.index + match[0].length;
    }

    // Remaining content
    if (lastIndex < text.length) {
      const content = text.slice(lastIndex);
      if (content.trim()) {
        sections.push({
          content: content.trim(),
          title: lastTitle,
          type: this.detectType(content)
        });
      }
    }

    return sections.length > 0 ? sections : [{ content: text, type: "paragraph" }];
  }

  private splitByParagraphs(text: string): string[] {
    return text.split(/\n\s*\n/).filter(p => p.trim());
  }

  private splitBySentences(text: string): string[] {
    // Handle Hebrew and English sentence boundaries
    return text.split(/(?<=[.!?])\s+/).filter(s => s.trim());
  }

  private detectType(content: string): ChunkResult["type"] {
    if (/^\|.+\|$/m.test(content)) return "table";
    if (/^[-*]\s+/m.test(content)) return "list";
    if (/^\d+\.\s+/m.test(content)) return "list";
    if (content.length < 100 && /^[A-Z\u0590-\u05FF]/.test(content)) return "header";
    return "paragraph";
  }

  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters for English, 2 for Hebrew
    const hebrewChars = (text.match(/[\u0590-\u05FF]/g) || []).length;
    const otherChars = text.length - hebrewChars;
    return Math.ceil(hebrewChars / 2 + otherChars / 4);
  }
}
```

#### 3.1.4 `embeddingClient.ts` - Embedding Service Client

```typescript
// Location: frontend-huggingface/src/lib/server/textGeneration/mcp/services/embeddingClient.ts

export class EmbeddingClient {
  private endpoint: string;

  constructor(options: { endpoint: string }) {
    this.endpoint = options.endpoint;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.endpoint}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error(`Embedding failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.endpoint}/embed/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts })
    });

    if (!response.ok) {
      throw new Error(`Batch embedding failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embeddings;
  }
}
```

#### 3.1.5 `rerankerClient.ts` - Reranker Service Client

```typescript
// Location: frontend-huggingface/src/lib/server/textGeneration/mcp/services/rerankerClient.ts

export interface RerankedResult {
  content: string;
  score: number;
  chunkId: string;
  originalIndex: number;
}

export class RerankerClient {
  private endpoint: string;

  constructor(options: { endpoint: string }) {
    this.endpoint = options.endpoint;
  }

  async rerank(query: string, documents: string[]): Promise<RerankedResult[]> {
    const response = await fetch(`${this.endpoint}/rerank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, documents })
    });

    if (!response.ok) {
      throw new Error(`Reranking failed: ${response.statusText}`);
    }

    const data = await response.json();

    return data.results.map((r: { index: number; score: number }, idx: number) => ({
      content: documents[r.index],
      score: r.score,
      originalIndex: r.index,
      chunkId: "" // Will be filled by caller
    }));
  }
}
```

#### 3.1.6 `documentContextStore.ts` - MongoDB Operations

```typescript
// Location: frontend-huggingface/src/lib/server/textGeneration/mcp/stores/documentContextStore.ts

import { MongoClient, ObjectId } from "mongodb";
import type { DocumentContext, DocumentChunk, ConversationMemory } from "../types/documentContext";

export class DocumentContextStore {
  private client: MongoClient;
  private db: string = "bricksllm";

  constructor(client: MongoClient) {
    this.client = client;
  }

  private get contexts() {
    return this.client.db(this.db).collection<DocumentContext>("document_contexts");
  }

  private get chunks() {
    return this.client.db(this.db).collection<DocumentChunk>("document_chunks");
  }

  private get memory() {
    return this.client.db(this.db).collection<ConversationMemory>("conversation_memory");
  }

  // Initialize indexes (call once on startup)
  async initializeIndexes(): Promise<void> {
    // Vector search index for chunks
    await this.chunks.createIndex(
      { embedding: "2dsphere" },
      { name: "embedding_vector_idx" }
    );

    // Compound index for conversation lookup
    await this.contexts.createIndex(
      { conversationId: 1 },
      { name: "conversation_idx" }
    );

    await this.chunks.createIndex(
      { conversationId: 1, chunkIndex: 1 },
      { name: "chunk_lookup_idx" }
    );
  }

  async createDocumentContext(data: Omit<DocumentContext, "_id" | "createdAt" | "lastAccessedAt" | "augmentationHistory">): Promise<DocumentContext> {
    const doc: DocumentContext = {
      ...data,
      _id: new ObjectId(),
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      augmentationHistory: []
    };

    await this.contexts.insertOne(doc);
    return doc;
  }

  async getDocumentContext(conversationId: string): Promise<DocumentContext | null> {
    const doc = await this.contexts.findOne({ conversationId });
    if (doc) {
      // Update last accessed
      await this.contexts.updateOne(
        { _id: doc._id },
        { $set: { lastAccessedAt: new Date() } }
      );
    }
    return doc;
  }

  async createChunks(chunks: Omit<DocumentChunk, "_id" | "retrievalCount" | "averageRerankerScore">[]): Promise<void> {
    const docs = chunks.map(c => ({
      ...c,
      _id: new ObjectId(),
      retrievalCount: 0,
      averageRerankerScore: 0
    }));

    await this.chunks.insertMany(docs);
  }

  async appendChunks(documentId: ObjectId, chunks: Omit<DocumentChunk, "_id" | "retrievalCount" | "averageRerankerScore">[]): Promise<void> {
    const docs = chunks.map(c => ({
      ...c,
      _id: new ObjectId(),
      retrievalCount: 0,
      averageRerankerScore: 0
    }));

    await this.chunks.insertMany(docs);

    // Update chunk count
    await this.contexts.updateOne(
      { _id: documentId },
      { $inc: { chunkCount: chunks.length } }
    );
  }

  async vectorSearch(conversationId: string, queryEmbedding: number[], limit: number): Promise<DocumentChunk[]> {
    // Note: This uses MongoDB Atlas Vector Search syntax
    // For local MongoDB, you may need a different approach (e.g., cosine similarity aggregation)

    return this.chunks.aggregate([
      {
        $match: { conversationId }
      },
      {
        $addFields: {
          similarity: {
            $reduce: {
              input: { $range: [0, { $size: "$embedding" }] },
              initialValue: 0,
              in: {
                $add: [
                  "$$value",
                  {
                    $multiply: [
                      { $arrayElemAt: ["$embedding", "$$this"] },
                      { $arrayElemAt: [queryEmbedding, "$$this"] }
                    ]
                  }
                ]
              }
            }
          }
        }
      },
      { $sort: { similarity: -1 } },
      { $limit: limit }
    ]).toArray() as Promise<DocumentChunk[]>;
  }

  async updateRetrievalStats(chunkIds: string[]): Promise<void> {
    await this.chunks.updateMany(
      { _id: { $in: chunkIds.map(id => new ObjectId(id)) } },
      {
        $inc: { retrievalCount: 1 },
        $set: { lastRetrievedAt: new Date() }
      }
    );
  }

  async recordAugmentation(documentId: ObjectId, record: { timestamp: Date; reason: string; chunksAdded: number }): Promise<void> {
    await this.contexts.updateOne(
      { _id: documentId },
      { $push: { augmentationHistory: record } }
    );
  }

  // Conversation memory operations
  async addLearnedFact(conversationId: string, fact: { fact: string; source: "document" | "user" | "inference"; confidence: number }): Promise<void> {
    await this.memory.updateOne(
      { conversationId },
      {
        $push: {
          learnedFacts: {
            ...fact,
            addedAt: new Date()
          }
        }
      },
      { upsert: true }
    );
  }

  async addQueryToHistory(conversationId: string, query: { query: string; language: "he" | "en"; answeredFromCache: boolean }): Promise<void> {
    await this.memory.updateOne(
      { conversationId },
      {
        $push: {
          queryHistory: {
            ...query,
            timestamp: new Date()
          }
        }
      },
      { upsert: true }
    );
  }

  async getConversationMemory(conversationId: string): Promise<ConversationMemory | null> {
    return this.memory.findOne({ conversationId });
  }
}
```

### 3.2 Modifications to Existing Files

#### 3.2.1 `runMcpFlow.ts` - Integration Points

```typescript
// ADDITIONS to frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts

// Add imports at top
import { DocumentRAGService } from "./services/documentRAG";
import { TraceEmitter } from "./services/traceEmitter";
import { TRACE_STEPS } from "./constants/traceSteps";

// Add to function parameters
interface RunMcpFlowParams {
  // ... existing params
  enableDocumentRAG?: boolean;  // NEW
  mongoClient?: MongoClient;    // NEW
}

// Inside runMcpFlow function, add early initialization:
export async function* runMcpFlow(params: RunMcpFlowParams) {
  // ... existing setup code ...

  // NEW: Initialize Document RAG if enabled
  const traceEmitter = new TraceEmitter();
  let documentRAG: DocumentRAGService | null = null;
  let runId: string | null = null;

  if (params.enableDocumentRAG && params.mongoClient) {
    documentRAG = new DocumentRAGService({
      traceEmitter,
      mongoClient: params.mongoClient
    });
  }

  // NEW: Start run trace
  if (documentRAG) {
    runId = traceEmitter.startRun(conversationId);
    traceEmitter.setLanguage(detectQueryLanguage(messages[messages.length - 1]?.content));

    // Emit initial step
    traceEmitter.stepStart(runId, TRACE_STEPS.UNDERSTANDING_REQUEST);
    traceEmitter.stepDone(runId, TRACE_STEPS.UNDERSTANDING_REQUEST.id);
  }

  // NEW: Check for document files and handle RAG ingestion
  const hasDocumentFile = messages.some(m =>
    m.files?.some(f => DOCLING_MIME_TYPES.includes(f.mime))
  );

  if (hasDocumentFile && documentRAG && runId) {
    const docFile = messages.flatMap(m => m.files || [])
      .find(f => DOCLING_MIME_TYPES.includes(f.mime));

    // Check if already ingested
    const existingContext = await documentRAG.store.getDocumentContext(conversationId);

    if (!existingContext) {
      // First time: Full ingestion
      await documentRAG.ingestDocument({
        runId,
        conversationId,
        filePath: docFile.path,
        fileName: docFile.name,
        mimeType: docFile.mime,
        userQuery: messages[messages.length - 1]?.content || ""
      });
    } else {
      // Follow-up: Retrieve from cache
      const retrievalResult = await documentRAG.retrieveContext({
        runId,
        conversationId,
        query: messages[messages.length - 1]?.content || ""
      });

      if (retrievalResult.hasContext && !retrievalResult.needsToolCall) {
        // Inject retrieved context into messages
        const contextInjection = documentRAG.buildContextInjection(retrievalResult);

        // Modify system message or prepend to user message
        messagesOpenAI = injectDocumentContext(messagesOpenAI, contextInjection);

        // Record in memory
        await documentRAG.store.addQueryToHistory(conversationId, {
          query: messages[messages.length - 1]?.content || "",
          language: detectQueryLanguage(messages[messages.length - 1]?.content),
          answeredFromCache: true
        });
      }
    }
  }

  // NEW: Stream trace events alongside assistant tokens
  // Modify the yield logic to include trace events

  // ... rest of existing runMcpFlow logic ...

  // NEW: At the end of successful response
  if (runId && traceEmitter) {
    traceEmitter.completeRun(runId);
  }
}

// Helper function to inject context
function injectDocumentContext(
  messages: ChatCompletionMessageParam[],
  contextInjection: string
): ChatCompletionMessageParam[] {
  if (!contextInjection) return messages;

  // Find last user message and prepend context
  const lastUserIndex = messages.findLastIndex(m => m.role === "user");
  if (lastUserIndex >= 0) {
    const userMsg = messages[lastUserIndex];
    const content = typeof userMsg.content === "string"
      ? userMsg.content
      : userMsg.content?.map(c => c.type === "text" ? c.text : "").join("");

    messages[lastUserIndex] = {
      ...userMsg,
      content: `${contextInjection}\n\n${content}`
    };
  }

  return messages;
}

function detectQueryLanguage(content: string | undefined): "he" | "en" {
  if (!content) return "en";
  const hebrewRegex = /[\u0590-\u05FF]/g;
  const hebrewChars = (content.match(hebrewRegex) || []).length;
  return hebrewChars > content.length * 0.1 ? "he" : "en";
}
```

#### 3.2.2 `toolPrompt.ts` - Language-Aware Response Instruction

```typescript
// ADDITIONS to frontend-huggingface/src/lib/server/textGeneration/mcp/toolPrompt.ts

// Add to buildToolPrompt function
function buildLanguageInstruction(queryLanguage: "he" | "en"): string {
  if (queryLanguage === "he") {
    return `
<language_instruction>
השאילתה של המשתמש היא בעברית. עליך לענות בעברית אלא אם המשתמש ביקש במפורש אחרת.
The user's query is in Hebrew. You MUST respond in Hebrew unless explicitly asked otherwise.
</language_instruction>
`;
  }
  return "";
}

// Integrate into existing prompt building
export function buildToolPrompt(params: ToolPromptParams): string {
  const { tools, messages, queryLanguage } = params;

  let prompt = "";

  // Add language instruction
  prompt += buildLanguageInstruction(queryLanguage || "en");

  // ... rest of existing prompt building ...

  return prompt;
}
```

---

## 4. Frontend Implementation

### 4.0 Technology Stack & Dependencies

**Required Packages:**
```bash
# Install in frontend-huggingface directory
npm install @melt-ui/svelte lucide-svelte
```

| Package | Version | Purpose |
|---------|---------|---------|
| `@melt-ui/svelte` | ^0.83.0 | Headless UI primitives (Collapsible, Accordion) |
| `lucide-svelte` | ^0.344.0 | Icon library (Loader2, Check, X, Circle, ChevronDown) |
| `tailwindcss` | (existing) | Styling with animations |

**Key Constraints:**
1. **Backend-driven steps only** - Never invent fake UI steps; steps must be emitted by backend when real operations occur
2. **Independent streams** - Assistant answer streams independently of trace steps
3. **Native EventSource** - Use browser SSE, no external libraries
4. **RTL support** - Full Hebrew/RTL layout support

### 4.1 Frontend Data Model

#### 4.1.1 Svelte Stores (`traceStore.ts`)

```typescript
// Location: frontend-huggingface/src/lib/stores/traceStore.ts

import { writable, derived } from "svelte/store";

// Step definition
export interface TraceStep {
  id: string;
  parentId: string | null;
  label: { he: string; en: string };
  status: "queued" | "running" | "done" | "error";
  detail?: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

// Run state per message
export interface RunState {
  runId: string;
  steps: Map<string, TraceStep>;
  stepOrder: string[];  // Maintains insertion order
  childrenByParent: Map<string, string[]>;  // parentId -> [childIds]
  completed: boolean;
  expanded: boolean;
  language: "he" | "en";
}

// Store: Map of runId -> RunState
export const runs = writable<Map<string, RunState>>(new Map());

// Actions
export function createRun(runId: string, language: "he" | "en"): void {
  runs.update(map => {
    map.set(runId, {
      runId,
      steps: new Map(),
      stepOrder: [],
      childrenByParent: new Map(),
      completed: false,
      expanded: true,
      language
    });
    return new Map(map);
  });
}

export function addStep(runId: string, step: TraceStep): void {
  runs.update(map => {
    const run = map.get(runId);
    if (!run) return map;

    run.steps.set(step.id, step);
    run.stepOrder.push(step.id);

    // Track parent-child relationship
    const parentId = step.parentId || "__root__";
    const children = run.childrenByParent.get(parentId) || [];
    children.push(step.id);
    run.childrenByParent.set(parentId, children);

    return new Map(map);
  });
}

export function updateStepStatus(
  runId: string,
  stepId: string,
  status: TraceStep["status"]
): void {
  runs.update(map => {
    const run = map.get(runId);
    if (!run) return map;

    const step = run.steps.get(stepId);
    if (step) {
      step.status = status;
    }

    return new Map(map);
  });
}

export function updateStepDetail(runId: string, stepId: string, detail: string): void {
  runs.update(map => {
    const run = map.get(runId);
    if (!run) return map;

    const step = run.steps.get(stepId);
    if (step) {
      step.detail = detail;
    }

    return new Map(map);
  });
}

export function completeRun(runId: string): void {
  runs.update(map => {
    const run = map.get(runId);
    if (!run) return map;

    run.completed = true;

    // Auto-collapse after 2 seconds
    setTimeout(() => {
      runs.update(m => {
        const r = m.get(runId);
        if (r) r.expanded = false;
        return new Map(m);
      });
    }, 2000);

    return new Map(map);
  });
}

export function toggleExpanded(runId: string): void {
  runs.update(map => {
    const run = map.get(runId);
    if (run) {
      run.expanded = !run.expanded;
    }
    return new Map(map);
  });
}

// Derived: Get run for specific runId
export function getRunStore(runId: string) {
  return derived(runs, $runs => $runs.get(runId));
}

// Derived: Get completion summary (e.g., "3/5 completed")
export function getRunSummary(runId: string) {
  return derived(runs, $runs => {
    const run = $runs.get(runId);
    if (!run) return { done: 0, total: 0 };

    const total = run.steps.size;
    const done = Array.from(run.steps.values())
      .filter(s => s.status === "done").length;

    return { done, total };
  });
}
```

### 4.2 New Svelte Components

#### 4.2.1 `TracePanel.svelte` - Main Trace UI (Using @melt-ui/svelte + lucide-svelte)

```svelte
<!-- Location: frontend-huggingface/src/lib/components/TracePanel.svelte -->

<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { fade, slide } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { createCollapsible, melt } from "@melt-ui/svelte";
  import { Loader2, Check, X, Circle, ChevronDown, CheckCircle2 } from "lucide-svelte";
  import type { TraceStep } from "$lib/stores/traceStore";
  import {
    runs,
    getRunStore,
    getRunSummary,
    addStep,
    updateStepStatus,
    updateStepDetail,
    completeRun,
    toggleExpanded
  } from "$lib/stores/traceStore";

  export let runId: string;
  export let language: "he" | "en" = "en";

  // Get reactive stores for this run
  $: runStore = getRunStore(runId);
  $: summaryStore = getRunSummary(runId);

  // Melt UI Collapsible
  const {
    elements: { root, content, trigger },
    states: { open }
  } = createCollapsible({
    defaultOpen: true
  });

  // Reactive: current run state
  $: run = $runStore;
  $: summary = $summaryStore;

  // Reactive: root steps (no parent)
  $: rootSteps = run
    ? (run.childrenByParent.get("__root__") || [])
        .map(id => run.steps.get(id))
        .filter((s): s is TraceStep => s !== undefined)
    : [];

  // Get children of a step
  function getChildSteps(parentId: string): TraceStep[] {
    if (!run) return [];
    return (run.childrenByParent.get(parentId) || [])
      .map(id => run.steps.get(id))
      .filter((s): s is TraceStep => s !== undefined);
  }

  // Get display label based on language
  function getLabel(step: TraceStep): string {
    return step.label[language] || step.label.en;
  }

  // Handle incoming trace events (called from parent)
  export function handleEvent(event: TraceEvent) {
    switch (event.type) {
      case "run.created":
        // Run already created by parent, just update language
        break;

      case "step.created":
        addStep(runId, event.step);
        break;

      case "step.status":
        updateStepStatus(runId, event.stepId, event.status);
        break;

      case "step.detail":
        updateStepDetail(runId, event.stepId, event.detail);
        break;

      case "run.completed":
        completeRun(runId);
        break;
    }
  }

  // Sync melt-ui open state with store
  $: if (run) {
    $open = run.expanded;
  }

  // Toggle handler
  function handleToggle() {
    toggleExpanded(runId);
  }
</script>

{#if run}
  <div
    use:melt={$root}
    class="trace-panel"
    class:rtl={language === "he"}
    class:completed={run.completed}
  >
    <!-- Header with Melt UI Trigger -->
    <button
      use:melt={$trigger}
      class="trace-header"
      on:click={handleToggle}
    >
      <!-- Status Icon -->
      <span class="header-icon">
        {#if run.completed}
          <CheckCircle2 class="w-5 h-5 text-green-500" />
        {:else}
          <Loader2 class="w-5 h-5 text-blue-500 animate-spin" />
        {/if}
      </span>

      <!-- Title + Summary -->
      <span class="header-text">
        {language === "he" ? "משימות רקע" : "Background tasks"}
        {#if summary.total > 0}
          <span class="text-xs text-gray-500 ml-2">
            ({summary.done}/{summary.total})
          </span>
        {/if}
      </span>

      <!-- Chevron -->
      <ChevronDown
        class="w-4 h-4 transition-transform duration-200"
        class:rotate-180={$open}
      />
    </button>

    <!-- Collapsible Content with Melt UI -->
    {#if $open}
      <div
        use:melt={$content}
        class="trace-steps"
        transition:slide={{ duration: 200 }}
      >
        {#each rootSteps as step (step.id)}
          <div
            class="trace-step"
            animate:flip={{ duration: 200 }}
            in:fade={{ duration: 150 }}
          >
            <!-- Vertical connector line -->
            <div class="step-line"></div>

            <!-- Status Icon (lucide-svelte) -->
            <div class="step-icon" data-status={step.status}>
              {#if step.status === "running"}
                <Loader2 class="w-4 h-4 text-blue-500 animate-spin" />
              {:else if step.status === "done"}
                <Check class="w-4 h-4 text-green-500" />
              {:else if step.status === "error"}
                <X class="w-4 h-4 text-red-500" />
              {:else}
                <Circle class="w-4 h-4 text-gray-400" />
              {/if}
            </div>

            <!-- Step Content -->
            <div class="step-content">
              <span class="step-label">{getLabel(step)}</span>
              {#if step.detail}
                <span class="step-detail" transition:fade={{ duration: 150 }}>
                  {step.detail}
                </span>
              {/if}
            </div>

            <!-- Nested Children (Hierarchical) -->
            {#if getChildSteps(step.id).length > 0}
              <div class="step-children">
                {#each getChildSteps(step.id) as child (child.id)}
                  <div
                    class="trace-step nested"
                    in:fade={{ duration: 100 }}
                  >
                    <div class="step-icon-small" data-status={child.status}>
                      {#if child.status === "running"}
                        <Loader2 class="w-3 h-3 text-blue-500 animate-spin" />
                      {:else if child.status === "done"}
                        <Check class="w-3 h-3 text-green-500" />
                      {:else if child.status === "error"}
                        <X class="w-3 h-3 text-red-500" />
                      {:else}
                        <Circle class="w-3 h-3 text-gray-400" />
                      {/if}
                    </div>
                    <span class="step-label-small">{getLabel(child)}</span>
                    {#if child.detail}
                      <span class="step-detail-small">{child.detail}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Base panel styling */
  .trace-panel {
    @apply bg-gray-50 dark:bg-gray-800/50 rounded-lg;
    @apply border border-gray-200 dark:border-gray-700;
    @apply mb-4 overflow-hidden transition-all duration-300;
    @apply shadow-sm;
  }

  .trace-panel.rtl {
    direction: rtl;
  }

  .trace-panel.completed {
    @apply border-green-300 dark:border-green-700/50;
    @apply bg-green-50/50 dark:bg-green-900/10;
  }

  /* Header button */
  .trace-header {
    @apply w-full flex items-center gap-3 px-4 py-3;
    @apply text-sm font-medium text-gray-700 dark:text-gray-300;
    @apply hover:bg-gray-100 dark:hover:bg-gray-700/50;
    @apply transition-colors duration-150 cursor-pointer;
    @apply focus:outline-none focus:ring-2 focus:ring-blue-500/50;
  }

  .header-icon {
    @apply flex-shrink-0;
  }

  .header-text {
    @apply flex-grow text-left flex items-center gap-2;
  }

  .rtl .header-text {
    @apply text-right flex-row-reverse;
  }

  /* Step list container */
  .trace-steps {
    @apply px-4 pb-4 space-y-1;
  }

  /* Individual step */
  .trace-step {
    @apply relative flex items-start gap-3 py-1.5 pl-2;
  }

  /* Vertical connector line between steps */
  .step-line {
    @apply absolute w-0.5 bg-gray-200 dark:bg-gray-600;
    left: 17px;
    top: 28px;
    bottom: -6px;
  }

  .trace-step:last-child .step-line {
    @apply hidden;
  }

  /* Step status icon container */
  .step-icon {
    @apply w-5 h-5 flex-shrink-0 flex items-center justify-center;
    @apply rounded-full bg-white dark:bg-gray-700 z-10;
    @apply border border-gray-200 dark:border-gray-600;
    @apply transition-all duration-200;
  }

  .step-icon[data-status="done"] {
    @apply border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/30;
  }

  .step-icon[data-status="error"] {
    @apply border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30;
  }

  .step-icon[data-status="running"] {
    @apply border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30;
  }

  /* Small icon for nested steps */
  .step-icon-small {
    @apply w-4 h-4 flex-shrink-0 flex items-center justify-center;
    @apply rounded-full bg-white dark:bg-gray-700;
  }

  /* Step content (label + detail) */
  .step-content {
    @apply flex flex-col gap-0.5 flex-grow min-w-0;
  }

  .step-label {
    @apply text-sm text-gray-700 dark:text-gray-300;
    @apply leading-tight;
  }

  .step-label-small {
    @apply text-xs text-gray-600 dark:text-gray-400;
  }

  .step-detail {
    @apply text-xs text-gray-500 dark:text-gray-400;
    @apply leading-tight;
  }

  .step-detail-small {
    @apply text-xs text-gray-400 dark:text-gray-500 ml-1;
  }

  /* Nested children container */
  .step-children {
    @apply ml-7 mt-1 space-y-1 w-full;
    @apply border-l-2 border-gray-200 dark:border-gray-600 pl-3;
  }

  .trace-step.nested {
    @apply pl-0 py-1 flex items-center gap-2;
  }

  /* RTL adjustments */
  .rtl .step-children {
    @apply ml-0 mr-7 border-l-0 border-r-2 pl-0 pr-3;
  }

  .rtl .step-line {
    left: auto;
    right: 17px;
  }

  /* Animation for spinning loader */
  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
```

### 4.3 SSE Event Handling (`chatEventSource.ts`)

```typescript
// Location: frontend-huggingface/src/lib/stores/chatEventSource.ts

import {
  createRun,
  addStep,
  updateStepStatus,
  updateStepDetail,
  completeRun
} from "./traceStore";
import type { TraceEvent } from "$lib/types/trace";

export interface ChatSSEOptions {
  onAssistantDelta: (content: string) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}

/**
 * Native EventSource handler for chat streaming
 * Handles both assistant tokens and trace events in a single SSE connection
 */
export function createChatEventSource(
  url: string,
  body: unknown,
  options: ChatSSEOptions
): { abort: () => void } {
  const abortController = new AbortController();

  // Use fetch + ReadableStream for POST with SSE
  (async () => {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream"
        },
        body: JSON.stringify(body),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            if (jsonStr === "[DONE]") {
              options.onComplete();
              return;
            }

            try {
              const event = JSON.parse(jsonStr);
              handleSSEEvent(event, options);
            } catch (e) {
              console.error("Failed to parse SSE event:", e);
            }
          }
        }
      }

      options.onComplete();
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        options.onError(error as Error);
      }
    }
  })();

  return {
    abort: () => abortController.abort()
  };
}

/**
 * Handle individual SSE events
 */
function handleSSEEvent(
  event: { type: "assistant" | "trace"; data: unknown },
  options: ChatSSEOptions
): void {
  if (event.type === "assistant") {
    // Assistant token chunk
    options.onAssistantDelta(event.data as string);
  } else if (event.type === "trace") {
    // Trace event - dispatch to store
    const traceEvent = event.data as TraceEvent;
    dispatchTraceEvent(traceEvent);
  }
}

/**
 * Dispatch trace events to the store
 */
function dispatchTraceEvent(event: TraceEvent): void {
  switch (event.type) {
    case "run.created":
      // Detect language from conversation (set externally)
      createRun(event.runId, "en"); // Language set by caller
      break;

    case "step.created":
      addStep(event.runId, event.step);
      break;

    case "step.status":
      updateStepStatus(event.runId, event.stepId, event.status);
      break;

    case "step.detail":
      updateStepDetail(event.runId, event.stepId, event.detail);
      break;

    case "run.completed":
      completeRun(event.runId);
      break;
  }
}
```

### 4.4 Type Definitions (`trace.ts`)

```typescript
// Location: frontend-huggingface/src/lib/types/trace.ts

export interface TraceStep {
  id: string;
  parentId: string | null;
  label: { he: string; en: string };
  status: "queued" | "running" | "done" | "error";
  detail?: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

// SSE Event Types
export type TraceEvent =
  | { type: "run.created"; runId: string; conversationId: string; timestamp: number }
  | { type: "run.completed"; runId: string; timestamp: number }
  | { type: "step.created"; runId: string; step: TraceStep }
  | { type: "step.status"; runId: string; stepId: string; status: TraceStep["status"]; timestamp: number }
  | { type: "step.detail"; runId: string; stepId: string; detail: string }
  | { type: "assistant.delta"; runId: string; content: string };
```

### 4.5 Modifications to Existing Frontend

#### 4.2.1 `ChatMessage.svelte` - Integrate TracePanel

```svelte
<!-- ADDITIONS to existing ChatMessage.svelte -->

<script lang="ts">
  import TracePanel from "./TracePanel.svelte";
  // ... existing imports

  // NEW: Trace panel reference
  let tracePanelRef: TracePanel;

  // NEW: Handle trace events from SSE stream
  export function handleTraceEvent(event: TraceEvent) {
    if (tracePanelRef) {
      tracePanelRef.handleEvent(event);
    }
  }
</script>

<!-- Add above the message content -->
{#if message.from === "assistant" && message.runId}
  <TracePanel
    bind:this={tracePanelRef}
    runId={message.runId}
    language={detectLanguage(message.content)}
  />
{/if}

<!-- ... existing message content ... -->
```

#### 4.2.2 `+server.ts` - SSE Streaming with Trace Events

```typescript
// MODIFICATIONS to frontend-huggingface/src/routes/api/chat/+server.ts

// Add trace event interleaving to SSE stream
async function* interleaveStreams(
  assistantStream: AsyncGenerator<string>,
  traceEmitter: TraceEmitter
): AsyncGenerator<{ type: "assistant" | "trace"; data: unknown }> {

  // Create merged stream
  const traceStream = traceEmitter.stream();

  // Use Promise.race to interleave
  let assistantDone = false;
  let traceDone = false;

  const getNextAssistant = async () => {
    const result = await assistantStream.next();
    if (result.done) assistantDone = true;
    return { source: "assistant" as const, value: result.value, done: result.done };
  };

  const getNextTrace = async () => {
    const result = await traceStream.next();
    if (result.done) traceDone = true;
    return { source: "trace" as const, value: result.value, done: result.done };
  };

  let pendingAssistant = getNextAssistant();
  let pendingTrace = getNextTrace();

  while (!assistantDone || !traceDone) {
    const result = await Promise.race([
      pendingAssistant.catch(() => null),
      pendingTrace.catch(() => null)
    ].filter(Boolean));

    if (result?.source === "assistant" && !result.done) {
      yield { type: "assistant", data: result.value };
      pendingAssistant = getNextAssistant();
    } else if (result?.source === "trace" && !result.done) {
      yield { type: "trace", data: result.value };
      pendingTrace = getNextTrace();
    }
  }
}

// In the POST handler:
export async function POST({ request }) {
  // ... existing setup ...

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      for await (const event of interleaveStreams(runMcpFlow(...), traceEmitter)) {
        const sseData = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(sseData));
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}
```

---

## 5. Streaming Protocol

### 5.1 SSE Event Format

```typescript
// Single SSE connection, two event types interleaved

// Type 1: Assistant content
data: {"type":"assistant","data":"Hello, "}

data: {"type":"assistant","data":"I found "}

data: {"type":"assistant","data":"the answer..."}

// Type 2: Trace events
data: {"type":"trace","data":{"type":"run.created","runId":"abc123","timestamp":1234567890}}

data: {"type":"trace","data":{"type":"step.created","runId":"abc123","step":{"id":"extracting-123","label":{"he":"מחלץ טקסט","en":"Extracting text"},"status":"running"}}}

data: {"type":"trace","data":{"type":"step.status","runId":"abc123","stepId":"extracting-123","status":"done"}}

data: {"type":"trace","data":{"type":"run.completed","runId":"abc123"}}
```

### 5.2 Frontend Event Handling

```typescript
// In chat store or component
const eventSource = new EventSource("/api/chat");

eventSource.onmessage = (event) => {
  const parsed = JSON.parse(event.data);

  if (parsed.type === "assistant") {
    // Append to message content
    currentMessage.content += parsed.data;
  } else if (parsed.type === "trace") {
    // Forward to TracePanel
    tracePanelRef.handleEvent(parsed.data);
  }
};
```

---

## 6. Integration Points

### 6.1 Entry Point: Document Upload

```
prepareFiles.ts (existing)
       │
       │ Detects Docling file
       ▼
runMcpFlow.ts (modified)
       │
       │ Checks: existingContext?
       ▼
  ┌────┴────┐
  │         │
 NO        YES
  │         │
  ▼         ▼
INGEST    RETRIEVE
  │         │
  │         │ Score ≥ 0.7?
  │         ▼
  │    ┌────┴────┐
  │    │         │
  │   YES       NO
  │    │         │
  │    ▼         ▼
  │  ANSWER   TIER 2/3
  │    │         │
  └────┴─────────┘
       │
       ▼
  Response + TracePanel
```

### 6.2 MongoDB Connection

```typescript
// Add to existing MongoDB initialization (if not present)
// Location: frontend-huggingface/src/lib/server/database/mongo.ts

import { MongoClient } from "mongodb";

let client: MongoClient | null = null;

export async function getMongoClient(): Promise<MongoClient> {
  if (!client) {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
    client = new MongoClient(uri);
    await client.connect();

    // Initialize indexes on first connection
    const store = new DocumentContextStore(client);
    await store.initializeIndexes();
  }
  return client;
}
```

### 6.3 Environment Variables

```bash
# Add to .env
MONGODB_URI=mongodb://localhost:27017
EMBEDDING_SERVICE_URL=http://localhost:5005
RERANKER_SERVICE_URL=http://localhost:5006
DOCUMENT_RAG_ENABLED=true
RERANKER_THRESHOLD=0.7
MAX_CONTEXT_CHUNKS=10
CONTEXT_TOKEN_BUDGET=8000
```

---

## 7. Migration Strategy

### 7.1 Phase 1: Backend Services (Non-Breaking)

**Files to create (no existing code modified):**
1. `mcp/services/documentRAG.ts`
2. `mcp/services/traceEmitter.ts`
3. `mcp/services/semanticChunker.ts`
4. `mcp/services/embeddingClient.ts`
5. `mcp/services/rerankerClient.ts`
6. `mcp/stores/documentContextStore.ts`
7. `mcp/types/trace.ts`
8. `mcp/types/documentContext.ts`
9. `mcp/constants/traceSteps.ts`

**Validation:**
- Unit tests for each service
- Integration test with mock MongoDB

### 7.2 Phase 2: Frontend Components (Non-Breaking)

**Files to create:**
1. `components/TracePanel.svelte`
2. `components/TracePanelIcons.svelte`

**Validation:**
- Storybook stories for TracePanel
- Test with mock trace events

### 7.3 Phase 3: Integration (Controlled Rollout)

**Files to modify:**
1. `runMcpFlow.ts` - Add RAG integration (behind feature flag)
2. `toolPrompt.ts` - Add language instruction
3. `+server.ts` - Add trace event streaming

**Feature Flag:**
```typescript
const ENABLE_DOCUMENT_RAG = env.DOCUMENT_RAG_ENABLED === "true";
```

**Validation:**
- End-to-end test with real document
- A/B comparison with existing flow

### 7.4 Phase 4: Full Rollout

1. Enable feature flag in production
2. Monitor for errors/regressions
3. Collect user feedback
4. Remove feature flag

---

## 8. Testing Plan

### 8.1 Unit Tests

```typescript
// Example test structure

describe("SemanticChunker", () => {
  it("should split by paragraph boundaries", async () => {
    const chunker = new SemanticChunker({ maxTokens: 500 });
    const result = await chunker.chunk("Para 1.\n\nPara 2.\n\nPara 3.");
    expect(result.length).toBe(3);
  });

  it("should handle Hebrew text", async () => {
    const chunker = new SemanticChunker({ maxTokens: 500 });
    const result = await chunker.chunk("פסקה ראשונה.\n\nפסקה שנייה.");
    expect(result.length).toBe(2);
  });

  it("should split large paragraphs by sentences", async () => {
    // ...
  });
});

describe("DocumentRAGService", () => {
  it("should ingest document and create chunks", async () => {
    // ...
  });

  it("should retrieve relevant chunks for query", async () => {
    // ...
  });

  it("should use Tier 2 when Tier 1 score is low", async () => {
    // ...
  });
});

describe("TraceEmitter", () => {
  it("should emit events in order", async () => {
    // ...
  });

  it("should support bilingual labels", async () => {
    // ...
  });
});
```

### 8.2 Integration Tests

```typescript
describe("Document RAG Flow", () => {
  it("should ingest PDF and answer follow-up from cache", async () => {
    // 1. Upload PDF
    // 2. Ask initial question
    // 3. Ask follow-up
    // 4. Verify no Docling tool call on follow-up
  });

  it("should augment context when Tier 1+2 fail", async () => {
    // 1. Upload PDF
    // 2. Ask question about obscure detail
    // 3. Verify Tier 3 augmentation
    // 4. Verify follow-up uses augmented context
  });

  it("should respond in Hebrew when queried in Hebrew", async () => {
    // 1. Upload English PDF
    // 2. Ask question in Hebrew
    // 3. Verify response is in Hebrew
  });
});
```

### 8.3 E2E Tests (Playwright)

```typescript
test("Document processing shows trace panel", async ({ page }) => {
  // Upload document
  await page.setInputFiles('input[type="file"]', 'test.pdf');
  await page.fill('textarea', 'סכם את המסמך');
  await page.click('button[type="submit"]');

  // Verify trace panel appears
  await expect(page.locator('.trace-panel')).toBeVisible();

  // Verify steps complete
  await expect(page.locator('[data-status="done"]')).toHaveCount({ minimum: 3 });

  // Verify Hebrew labels
  await expect(page.locator('.step-label')).toContainText('מחלץ');
});
```

---

## 9. Rollback Plan

### 9.1 Feature Flag Disable

```bash
# Immediate rollback - disable feature
DOCUMENT_RAG_ENABLED=false
```

### 9.2 Code Rollback

```bash
# If code changes cause issues
git revert HEAD~N  # Revert N commits
```

### 9.3 Database Cleanup (if needed)

```javascript
// MongoDB cleanup script
db.document_contexts.drop();
db.document_chunks.drop();
db.conversation_memory.drop();
```

### 9.4 Monitoring Alerts

- **Error rate spike** → Auto-disable feature flag
- **Latency increase > 2x** → Alert + investigate
- **Memory usage spike** → Check chunk storage

---

## 10. File Change Summary

### New Files (19 files)

#### Backend Services
| File | Purpose | Lines (est.) |
|------|---------|--------------|
| `mcp/services/documentRAG.ts` | Main RAG orchestrator | 350 |
| `mcp/services/traceEmitter.ts` | SSE event streaming | 150 |
| `mcp/services/semanticChunker.ts` | Paragraph-aware document splitting | 120 |
| `mcp/services/embeddingClient.ts` | Embedding API client (port 5005) | 50 |
| `mcp/services/rerankerClient.ts` | Reranker API client (port 5006) | 60 |
| `mcp/stores/documentContextStore.ts` | MongoDB CRUD operations | 200 |
| `mcp/types/trace.ts` | Trace type definitions | 80 |
| `mcp/types/documentContext.ts` | Document type definitions | 100 |
| `mcp/constants/traceSteps.ts` | Bilingual step labels | 80 |
| `database/mongo.ts` | MongoDB connection singleton | 40 |

#### Frontend Components
| File | Purpose | Lines (est.) |
|------|---------|--------------|
| `components/TracePanel.svelte` | Melt-UI collapsible + lucide icons | 250 |
| `stores/traceStore.ts` | Svelte stores for run/step state | 120 |
| `stores/chatEventSource.ts` | Native SSE handler | 100 |
| `types/trace.ts` | Frontend trace types | 40 |

#### Tests
| File | Purpose | Lines (est.) |
|------|---------|--------------|
| `tests/unit/semanticChunker.test.ts` | Chunker unit tests | 100 |
| `tests/unit/documentRAG.test.ts` | RAG service tests | 150 |
| `tests/unit/traceEmitter.test.ts` | Trace emitter tests | 80 |
| `tests/integration/documentFlow.test.ts` | E2E document flow | 150 |
| `tests/e2e/tracePanel.spec.ts` | Playwright UI tests | 100 |

### Modified Files (4 files)

| File | Changes | Risk |
|------|---------|------|
| `runMcpFlow.ts` | Add RAG integration behind feature flag (~100 lines) | Medium |
| `toolPrompt.ts` | Add Hebrew language instruction (~20 lines) | Low |
| `+server.ts` | Add trace event interleaving in SSE stream (~50 lines) | Medium |
| `ChatMessage.svelte` | Integrate TracePanel component (~20 lines) | Low |

### Dependencies to Install

```bash
cd frontend-huggingface
npm install @melt-ui/svelte lucide-svelte
```

### Configuration Files (2 files)

| File | Changes |
|------|---------|
| `.env` | Add: `MONGODB_URI`, `DOCUMENT_RAG_ENABLED`, `RERANKER_THRESHOLD`, `MAX_CONTEXT_CHUNKS`, `CONTEXT_TOKEN_BUDGET` |
| `docker-compose.yml` | Ensure MongoDB service exists |

---

## 11. Implementation Constraints (Critical)

### Backend-Driven Steps ONLY

```
❌ WRONG: Frontend invents fake steps
   UI shows "Thinking..." without backend event

✅ CORRECT: Backend emits step when operation starts
   traceEmitter.stepStart(runId, TRACE_STEPS.SEARCHING_KNOWLEDGE)
   // ... actual vector search happens ...
   traceEmitter.stepDone(runId, stepId)
```

### Independent Streams

```
┌─────────────────────────────────────────────────────────┐
│ SSE Connection (single stream, two event types)        │
├─────────────────────────────────────────────────────────┤
│ data: {"type":"trace","data":{step.created...}}        │
│ data: {"type":"assistant","data":"The document..."}    │
│ data: {"type":"trace","data":{step.status: done}}      │
│ data: {"type":"assistant","data":" contains..."}       │
│ data: {"type":"trace","data":{run.completed}}          │
└─────────────────────────────────────────────────────────┘

Assistant tokens stream INDEPENDENTLY of trace steps.
UI must handle both concurrently.
```

### Language Detection

```typescript
// Query language determines:
// 1. Trace step labels (Hebrew or English)
// 2. Assistant response language
// 3. User context storage

const language = detectQueryLanguage(userMessage);
// Hebrew chars > 10% of message → "he"
// Otherwise → "en"
```

---

## Approval Checklist

Before implementation, please confirm:

- [ ] Architecture overview is acceptable
- [ ] MongoDB as persistent storage backend is confirmed
- [ ] Token budget allocation (8K chunks, 18K response) is appropriate
- [ ] Trace step labels (Hebrew/English) are acceptable
- [ ] 3-tier retrieval strategy (semantic → LLM assess → augment) is approved
- [ ] @melt-ui/svelte + lucide-svelte for UI is acceptable
- [ ] Native EventSource (not external library) for SSE is approved
- [ ] Testing plan covers critical paths
- [ ] Rollback plan (feature flag disable) is sufficient

---

**Status:** Awaiting user approval before implementation.

**Next Steps After Approval:**
1. Install frontend dependencies (`@melt-ui/svelte`, `lucide-svelte`)
2. Create backend services (Phase 1)
3. Create frontend components (Phase 2)
4. Integrate into `runMcpFlow.ts` with feature flag (Phase 3)
5. Test end-to-end with real PDF document
6. Enable feature flag for production

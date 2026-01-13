# CLAUDE.md

## Project Overview

**BricksLLM** is an enterprise-grade AI gateway and chat interface optimized for **DictaLM-3.0 (24B)**. It orchestrates a local Docker stack to provide a robust, secure, and "Reasoning-First" experience with full Hebrew (RTL) support and Model Context Protocol (MCP) integration.

### Core Stack

| Container Name | Purpose | Host Port | Internal Port |
| :--- | :--- | :--- | :--- |
| **`frontend-UI`** | User Chat UI (SvelteKit) | **8004** | `3000` |
| **`bricksllm-gateway`** | Main API Entrypoint & Admin API | **8002**, **8001** | `8002`, `8001` |
| **`bricksllm-llama`** | Inference Engine (Llama-server) | **5002** | `5002` |
| **`bricksllm-mongo`** | Primary Database & Memory Collections | **27018** | `27017` |
| **`bricksllm-qdrant`** | Vector Database for Memory System | **6333** | `6333` |
| **`dicta-retrieval`** | Embeddings (5005) & Reranking (5006) | **5005**, **5006** | `5005`, `5006` |
| **`dicta-docling`** | Document Parsing, OCR & Processing | **5001** | `5001` |
| **`mcp-sse-proxy`** | Bridge for SSE-based MCP Tools | **3100** | `3100` |
| **`bricksllm-redis`** | Rate Limiting & Caching Service | **6380** | `6379` |
| **`bricksllm-postgresql`** | Proxy Configuration Storage | **5433** | `5432` |

- **Inference**: `llama-server` (CUDA) running `DictaLM-3.0-24B-Thinking-FP8-Q4_K_M.gguf`.
- **Gateway**: Go-based proxy (BricksLLM) for rate limiting, auth, and caching.
- **Frontend**: SvelteKit interface with hot-reload (dev) and production builds.
- **Orchestration**: Docker Compose driven by a **single consolidated `.env` file**.

---

## 🚨 Critical Rules

My CLAUDE.MD:

1. First think through the problem, read the codebase for relevant files.
2. Before you make any major changes, check in with me and I will verify the plan.
3. Please every step of the way just give me a high level explanation of what changes you made
4. Make every task and code change you do as simple as possible. We want to avoid making any massive or complex changes. Every change should impact as little code as possible. Everything is about simplicity.
5. Maintain a documentation file that describes how the architecture of the app works inside and out.
6. **RoamPal Parity Protocol (MANDATORY)**: Never speculate. When implementing features to achieve parity with RoamPal:
   - **Research**: Read the Map in `MAP_ROAMPAL/` and the Source in `SRC_ROAMPAL/` to understand the original logic.
   - **Adapt**: Implement the "same-way" solution for BricksLLM stack (MongoDB/Qdrant, Dicta-retrieval, Svelte/Vite), assuming a single admin user and supporting Hebrew.
   - **Verify**: Confirm the logic matches RoamPal exactly, even if tools/DBs differ.
   
   Full Protocol Detail:
   
   When implementing or refactoring features to achieve parity with the RoamPal memory system, **MUST** follow this thinking process:

### 1. Research Phase (MANDATORY)
Before writing any code or proposing a solution, "Claude" **MUST**:
- **Read the Map**: First, read the relevant technical map file in `/home/ilan/BricksLLM/MAP_ROAMPAL/` (e.g., if working on chat logic, read `MAP_ROAMPAL/.../agent_chat.py.md`).
- **Read the Source**: If the map isn't enough for full understanding, read the actual source file in `/home/ilan/BricksLLM/SRC_ROAMPAL/` which resides under the same name/path as the original roampal source.
- **Understand the Logic**: Fully digest how the method, function, or file was implemented in the original RoamPal code to ensure our logic matches the "Memory-First" architecture.

### 2. Adaptation Phase
Once the RoamPal logic is understood, adapt it to the BricksLLM stack while respecting these **CRITICAL** differences:
- **Database**: We use **MongoDB** (for document storage) and **Qdrant** (for vector storage), **NOT** ChromaDB.
- **Embeddings**: We use **Dicta-retrieval** (BGE-M3/Reranker) via API, not local Ollama/SentenceTransformers.
- **Frontend**: We use **Svelte components on Vite**, **NOT** React/Tauri. Ensure UI components follow Svelte patterns.
- **Security/Auth**: Our system is designed for a **single admin user**. Resolve any multi-tenant or complex authorization issues at the outset by assuming admin privileges.
- **Language**: Support **Hebrew** as a first-class citizen in all intent detection and responses.

### 3. Verification
The goal is **Full Parity** with the *logic* of RoamPal, even if the underlying *implementation* (database, framework) differs. Every solution should be a "same-way" solution adapted for our superior stack.
7. **Maintain STATUS.md**: Record every significant code modification, fix, or implementation in `/home/ilan/BricksLLM/STATUS.md`.
8. **Consult STATUS.md**: **ALWAYS** read `STATUS.md` at the beginning of a task to understand the current state of the project and what has already been solved or implemented.

### 1. Stop Before Start

**ALWAYS** stop the stack before starting it to prevent port conflicts and ensure config updates apply.

```bash
./stop.sh && ./start.sh
```

### 2. Frontend Logic

- **Do NOT** run `npm run dev` locally. Use the Docker container (port 8003).
- **Core Logic**: `src/lib/server/textGeneration/mcp/runMcpFlow.ts` is the "brain" of the frontend.

### 3. Database State

- If `POSTGRESQL_PASSWORD` changes, you **MUST** delete the volume: `docker volume rm bricksllm_postgresql_data`.

---

## 🧠 Frontend Core: MCP Orchestration (`runMcpFlow.ts`)

The `runMcpFlow.ts` file (~1200 lines) is the central orchestrator for the frontend. It manages the "Reasoning First" flow, tool execution, and stream parsing.

### High-Level Flow

1.  **Initialization**: Loads `MCP_SERVERS` from `.env`, initializes `ServiceContainer`.
2.  **Prompting**: Uses `toolPrompt.ts` to inject "Reasoning First" instructions (`<think>` -> Decision).
3.  **Inference**: Streams tokens from `endpointOai.ts` (max 16k tokens).
4.  **Decision Loop**:
    - **Smart Skip**: If model outputs `</think>` with no tools, stream answer directly.
    - **Tool Execution**: If JSON tool calls found:
      - **Filter**: `ToolFilterService` validates intent (e.g., "Search" -> Perplexity).
      - **Loop Check**: `LoopDetectorService` prevents infinite recursion (3x repeat limit).
      - **Execute**: `toolInvocation.ts` calls the MCP server.
      - **Recurse**: Appends result and continues loop.
5.  **Safety**: `xmlUtils.ts` repairs unclosed tags (e.g., `</think>`) before UI rendering.

### Key Components

| Component                         | Responsibility                                                                |
| :-------------------------------- | :---------------------------------------------------------------------------- |
| **`runMcpFlow.ts`**               | Main loop, stream parsing, dependency injection.                              |
| **`toolPrompt.ts`**               | Constructs the prompt. Enforces `<think>` block and step limits.              |
| **`toolFilter.ts`**               | "Best-in-Class" selection (e.g., Perplexity > Google). Handles Hebrew intent. |
| **`toolIntelligenceRegistry.ts`** | Central metadata for all tools (latency, fallbacks, messages).                |
| **`toolParameterRegistry.ts`**    | Parameter alias mapping & automatic normalization.                            |
| **`toolInvocation.ts`**           | Tool execution, cascade fallback, graceful error handling.                    |
| **`loopDetector.ts`**             | Semantic hashing to stop infinite tool loops.                                 |
| **`circuitBreaker.ts`**           | Fails fast if external MCP servers are down.                                  |

---

## ⚙️ Configuration (Consolidated `.env`)

The project uses a **single source of truth** `.env` file for all services (Backend, Frontend, Llama).

### 1. Llama Server & Model

| Variable        | Value (Example)  | Purpose                                 |
| :-------------- | :--------------- | :-------------------------------------- |
| `HF_FILE`       | `dictalm...gguf` | Model filename.                         |
| `CONTEXT_SIZE`  | `32768`          | **Critical**: 32k needed for MCP tools. |
| `N_GPU_LAYERS`  | `99`             | Full GPU offload.                       |
| `FLASH_ATTN`    | `on`             | 30-40% speedup for RTX 3090.            |
| `KV_CACHE_TYPE` | `q8_0`           | Quantized cache to save ~6GB VRAM.      |

### 2. Frontend & MCP

| Variable                    | Value (Example) | Purpose                                                 |
| :-------------------------- | :-------------- | :------------------------------------------------------ |
| `MCP_USE_NATIVE_TOOLS`      | `false`         | **MUST** be false to enable "Reasoning First" logic.    |
| `MCP_SERVERS`               | `[...]`         | JSON array of MCP endpoints (Tavily, Perplexity, etc.). |
| `MCP_MAX_TOOLS`             | `4`             | Limit tools per turn to save context.                   |
| `FRONTEND_MODEL_MAX_TOKENS` | `16384`         | Allows deep reasoning chains.                           |

### 3. Backend (Go/Postgres/Redis)

| Variable              | Value        | Purpose                      |
| :-------------------- | :----------- | :--------------------------- |
| `POSTGRESQL_PASSWORD` | `postgres`   | **Change in production**.    |
| `REDIS_PASSWORD`      | `...`        | Secure Redis.                |
| `BRICKSLLM_MODE`      | `production` | Enables/disables debug logs. |

---

## 🏗️ Architecture & Ports

### Docker Network (`bricksllm-network`)

| Service        | Internal | Host    | Purpose                            |
| :------------- | :------- | :------ | :--------------------------------- |
| **Frontend**   | `8003`   | `8003`  | User Chat UI (Hot-reload).         |
| **Proxy**      | `8002`   | `8002`  | **Main Entrypoint** for API calls. |
| **Embeddings** | `5005`   | `5005`  | `dicta-retrieval` (BGE-M3).        |
| **Reranker**   | `5006`   | `5006`  | `dicta-retrieval` (BGE-Reranker).  |
| **Docling**    | `5001`   | `5001`  | Document Parsing & OCR.            |
| **Admin**      | `8001`   | `8001`  | Configuration API.                 |
| **Llama**      | `5002`   | `5002`  | Inference Engine.                  |
| **Redis**      | `6379`   | `6380`  | Rate limiting & Cache.             |
| **Postgres**   | `5432`   | `5433`  | Persistent storage.                |
| **MongoDB**    | `27017`  | `27018` | Document storage for Memmory.      |

### Data Flow

1.  **User** -> Frontend (`8003`)
2.  Frontend -> Proxy (`8002`)
3.  Proxy -> Llama Server (`5002`)
4.  MCP Tools -> External APIs (via `mcp-sse-proxy`)

---

## 🚀 Project Status (Recent Updates)

### Enterprise Tool Intelligence System ✅

A comprehensive suite of 30+ smart methods for intelligent tool orchestration:

| Layer           | Feature                 | Description                                            |
| :-------------- | :---------------------- | :----------------------------------------------------- |
| **Selection**   | Hebrew Intent Detection | Understands Hebrew queries (3,972 bidirectional terms) |
| **Selection**   | Best-in-Class Selection | Picks optimal tool from similar options                |
| **Preparation** | Parameter Normalization | Fixes model parameter mistakes automatically           |
| **Execution**   | Cascade Fallback        | Tries alternatives before failing                      |
| **Execution**   | Smart Timeouts          | 5 min for research, 1 min for quick tools              |
| **Response**    | Graceful Errors         | Hebrew messages with actionable guidance               |
| **Response**    | Capability Awareness    | Model can describe and suggest its tools               |

### DataGov Enterprise Intelligence ✅

Israeli government data integration with 20+ specialized methods:

- **1,190 per-dataset schema files** organized in 20 categories
- **1,960 resources** with field-level semantic metadata
- **~9,500+ searchable terms** (expansions + tags + keywords)
- **22 semantic domains** with bidirectional Hebrew↔English mapping
- **Auto-aggregation** for count queries ("כמה רכבים?")
- **Query decomposition** separating WHAT from WHERE
- **Subject-first scoring** prioritizing intent over location

📖 **Full documentation**: `frontend-huggingface/docs/smarter.md`

### MCP Ecosystem

- **Tools**: 80+ tools cataloged in `mcp_tools_list.md`.
- **Categories**: Research, Search, Data, Files, Development, Utility.
- **Fallback Chains**: DataGov → Perplexity → Tavily for Israeli data.

### Pending / Roadmap

- **Context Manager**: Plan to use Sliding Window + Summarization to handle 24GB VRAM limit.
- **Mem0**: Evaluated but currently **not implemented** (relying on native Mongo/Redis).

---

## 🛠️ Operational Guide

### Deployment

```bash
# 1. Setup Env
cp .env.template .env
# Edit .env with API keys (Tavily, Perplexity, etc.)

# 2. Start
./start.sh

# 3. Verify
./test-stack.sh
```

### Troubleshooting

- **502 Bad Gateway**: Llama server is still loading model (takes ~45s). Check `docker logs -f llama-server`.
- **OOM / Crash**: Check `nvidia-smi`. Reduce `CONTEXT_SIZE` if VRAM is full.
- **"Thinking" not showing**: Ensure `MCP_USE_NATIVE_TOOLS=false`.

---

## 📂 File Structure Highlights

- **`frontend-huggingface/src/lib/server/textGeneration/mcp/`**:
  - `runMcpFlow.ts`: **Core Orchestrator**.
  - `toolPrompt.ts`: Prompt engineering & constraints.
  - `toolIntelligenceRegistry.ts`: Tool metadata, fallbacks, capability awareness.
  - `toolParameterRegistry.ts`: Parameter normalization & alias mapping.
  - `toolInvocation.ts`: Execution, cascade fallback, graceful errors.
  - `toolFilter.ts`: Hebrew intent detection, best-in-class selection.
  - `loopDetector.ts`: Safety mechanism.
  - `serviceContainer.ts`: Dependency Injection.
- **`frontend-huggingface/src/lib/server/endpoints/openai/`**:
  - `endpointOai.ts`: OpenAI client with `max_tokens` override.
- **`datagov/`** (DataGov MCP Server):
  - `server.py`: MCP server with query tools.
  - `query_builder.py`: Query decomposition, scoring, expansion.
  - `enterprise_expansions.py`: 22 domains, 3,972 Hebrew↔English terms.
  - `schemas/`: **1,190 per-dataset schema files** in 20 category dirs.
- **Documentation**:
  - `frontend-huggingface/docs/smarter.md`: **Enterprise Tool Intelligence Guide**.
  - `mcp_tools_list.md`: Tool catalog.
- **Root**:
  - `.env`: **Consolidated Config**.

---

## 📚 Roampal Memory System Reference

This section applies **ONLY** when referencing the code in the `roampal/` directory for memory system implementation context. Do not refactor or modify these files.

### Backend (Python)

- **Chat Processing** → [roampal/backend/app/routers/agent_chat.py](roampal/backend/app/routers/agent_chat.py#L58-L650)
- **Memory Search** → [roampal/backend/modules/memory/unified_memory_system.py](roampal/backend/modules/memory/unified_memory_system.py#L234-L380)
- **Memory Storage** → [roampal/backend/modules/memory/unified_memory_system.py](roampal/backend/modules/memory/unified_memory_system.py#L156-L230)
- **Memory Promotion** → [roampal/backend/main.py](roampal/backend/main.py#L59-L95)
- **Model Switch** → [roampal/backend/app/routers/model_switcher.py](roampal/backend/app/routers/model_switcher.py#L78-L150)
- **Session CRUD** → [roampal/backend/app/routers/sessions.py](roampal/backend/app/routers/sessions.py#L45-L180)
- **Book Upload** → [roampal/backend/api/book_upload_api.py](roampal/backend/api/book_upload_api.py#L32-L213)

### Frontend (React/Tauri)

- **UI Chat** → [roampal/tauri-ui/components/ConnectedChat.tsx](roampal/tauri-ui/components/ConnectedChat.tsx#L200-L800)
- **UI Messages** → [roampal/tauri-ui/components/EnhancedChatMessage.tsx](roampal/tauri-ui/components/EnhancedChatMessage.tsx#L50-L250)
- **UI Sidebar** → [roampal/tauri-ui/components/Sidebar.tsx](roampal/tauri-ui/components/Sidebar.tsx#L100-L400)
- **Chat Store** → [roampal/tauri-ui/stores/useChatStore.ts](roampal/tauri-ui/stores/useChatStore.ts#L150-L600)
- **WebSocket** → [roampal/tauri-ui/stores/useChatStore.ts](roampal/tauri-ui/stores/useChatStore.ts#L800-L950)

---

# CRITICAL WHEN USING GENSPARK AI DEVELOPER

due to sandbox resource limits do not attempt to check scripts linter. 
verify the syntax is correct by checking specific files only. 
do not try to build. 
do not waste tokens on re-reading the same file over and over. 

please note that my frontend-ui supports hot-reload so dont instruct me to build the frontend unless no other choice.

 i want you to take note that your sandboxed version is not the same after you modified the code in the sandbox. i have to pull to my local codebase the changes you have commited. i want you to remember i use sync-genspark.sh script that allows me to do sync of your pushed commits to my local codebase automatically.
 
 for this reason i ask you from now to make commit names with sequential number+description. this sync-genspark.sh script should be able to pull the changes you will in your sandbox after you have commited the changes to the genspark branch.
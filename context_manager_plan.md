# Context Manager & Long-Term Memory Plan (Mem0 Edition)

## 1. Executive Summary
This plan implements an **Enterprise-Grade Memory System** using **Mem0** (Universal Memory Layer) to handle both Short-Term (Session) and Long-Term (Cross-Chat) memory.

**Core Philosophy:**
- **Don't Rebuild the Wheel:** Leverage `mem0` for memory orchestration.
- **Local & Private:** All components (LLM, Embeddings, Vector Store) run locally in Docker.
- **Resource Efficiency:**
    -   **Vector Store:** Upgrade existing Redis to **Redis Stack** (In-Memory Vector Search).
    -   **Embeddings:** Use **Text Embeddings Inference (TEI)** on CPU with a lightweight multilingual model (`BAAI/bge-m3`), preserving GPU VRAM for the main model.
    -   **LLM:** Reuse existing `llama-server`.

---

## 2. Architecture: The "Mem0" Stack

We will deploy a 3-container memory subsystem integrated with the existing stack:

### Layer A: The Orchestrator (`mem0-api-server`)
*   **Role:** Manages adding/searching memories, abstracting vector logic.
*   **Port:** 8005
*   **Config:**
    *   **LLM Provider:** OpenAI (pointing to `llama-server`).
    *   **Embedder:** HuggingFace (pointing to `tei`).
    *   **Vector Store:** Redis.

### Layer B: The Brains
*   **LLM:** `llama-server` (Port 5002) - *Existing*
    *   Running: DictaLM-3.0 (24B)
*   **Embedder:** `tei` (Port 8081) - *New*
    *   Running: `BAAI/bge-m3` (Multilingual, supports Hebrew/English).
    *   Why CPU? It's fast enough for embeddings and saves precious VRAM.

### Layer C: The Storage (`redis-stack`)
*   **Role:** Fast in-memory vector storage + Rate Limiting cache.
*   **Upgrade:** Swap `redis:7.2-alpine` -> `redis/redis-stack-server:latest`.
*   **Impact:** Zero code change for existing Rate Limiter (fully backward compatible).

---

## 3. Implementation Steps

### Phase 1: Infrastructure (Docker)
1.  **Upgrade Redis**: Change image to `redis/redis-stack-server`.
2.  **Add TEI Service**:
    ```yaml
    tei:
      image: ghcr.io/huggingface/text-embeddings-inference:cpu-1.5
      command: --model-id BAAI/bge-m3 --port 80
    ```
3.  **Add Mem0 Service**:
    ```yaml
    mem0:
      image: mem0ai/mem0-api-server:latest
      volumes:
        - ./mem0_config.json:/app/config.json
      environment:
        - MEM0_CONFIG_PATH=/app/config.json
    ```

### Phase 2: Configuration
Create `mem0_config.json`:
```json
{
  "vector_store": {
    "provider": "redis",
    "config": {
      "redis_url": "redis://redis:6379",
      "embedding_model_dims": 1024
    }
  },
  "llm": {
    "provider": "openai",
    "config": {
      "model": "dictalm-3.0",
      "openai_base_url": "http://llama-server:5002/v1",
      "openai_api_key": "sk-dummy"
    }
  },
  "embedder": {
    "provider": "huggingface",
    "config": {
      "model": "BAAI/bge-m3",
      "huggingface_base_url": "http://tei:80/v1"
    }
  }
}
```

### Phase 3: Application Integration
1.  **Install SDK**: `npm install mem0ai`.
2.  **Modify `ContextManager`**:
    *   On User Message: `mem0.search(message, user_id)` -> Inject results into System Prompt.
    *   On Turn Complete: `mem0.add(messages, user_id)` (Async/Background).

---

## 4. Resource Impact Analysis

| Component | RAM Usage | VRAM Usage | Notes |
| :--- | :--- | :--- | :--- |
| **Redis Stack** | +100MB | 0 | Efficient in-memory vectors. |
| **TEI (CPU)** | ~1GB | 0 | `bge-m3` is ~500MB quantized. Runs on CPU. |
| **Mem0 API** | ~200MB | 0 | Lightweight Python API. |
| **Total** | **~1.3GB** | **0** | **Safe for 24GB VRAM System.** |

## 5. Verification Plan
1.  **Health Check**: `curl http://localhost:8005/health`
2.  **Embedding Check**: `curl http://localhost:8081/info`
3.  **End-to-End**: Send a chat, verify memory is stored in Redis (via `redis-cli`).

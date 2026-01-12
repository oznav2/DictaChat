# model_switcher.py (routers) - Map

## Summary

`model_switcher.py` is the complex orchestration engine responsible for hot-swapping LLMs and managing remote model downloads. It provides a unified interface for interacting with both **Ollama** and **LM Studio**. Its primary responsibilities include runtime switching of the active LLM client, persistent `.env` updates, and a multi-stage GGUF ingestion pipeline that downloads, imports, and verifies models from HuggingFace without requiring a backend restart.

---

## Technical Map

### Providers & Detection (Lines 37-192, 245-312)

- **`PROVIDERS` Registry**: Tracks port numbers and API styles for Ollama (`ollama`) and LM Studio (`openai`).
- **`detect_provider`**: Probes local ports to determine which AI backends are currently active on the user's machine.
- **`list_available_models`**: Aggregate a combined list of chat-capable models from all running providers, filtering out embedding-only models.

### GGUF Ingestion Pipeline (Lines 335-575, 1214-1565)

- **HuggingFace Integration**: Uses `MODEL_TO_HUGGINGFACE` mapping to resolve internal model names to Bartowski GGUF repositories.
- **`download_gguf_stream`**:
  - **Stage 1**: Streams the binary download from HF directly to a local `.cache` folder with SSE progress tracking.
  - **Stage 2**: Invokes the `lms.exe` CLI (`import --copy`) to register the file with LM Studio.
- **`uninstall_model`**: specialized logic for both sub-processes (Ollama `rm`) and filesystem manipulation (manually scrubbing LM Studio's hidden model folders).

### Runtime Switching (Lines 774-984)

- **`switch_model`**:
  - **Detection**: Probes both providers to find which one owns the requested model name.
  - **State Update**: Updates `app.state.llm_client` and the shared `agent_service.llm` reference.
  - **Verification**: Executes a 10-token test prompt on the new model. If it hangs or errors, it performs an automatic **Rollback** to the previously active model.
  - **Persistence**: Updates the `.env` file using an async lock (`_env_file_lock`) to ensure the choice persists after the application is closed.

### Real-time Communication (Lines 1060-1212, 1684-1846)

- **SSE & WebSockets**: provide two different ways for the UI to monitor long-running pull/download operations. The WebSocket implementation is specifically optimized for packaged Tauri production builds.

---

## Connection & Dependencies

- **OllamaClient.py**: the active instance of this client is modified by the switcher's `switch_model` logic.
- **model_registry.py**: Supplies the quantization metadata and HF repo links.
- **AgentChatService.py**: Relies on the switcher to update its internal LLM provider reference.
- **SettingsModal (Frontend)**: The "Model Switcher" and "Download" menus are the primary consumers of these endpoints.
- **.env**: The persistent source-of-truth for the default model on boot.

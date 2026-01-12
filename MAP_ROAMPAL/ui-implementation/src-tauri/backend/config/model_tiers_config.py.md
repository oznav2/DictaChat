# model_tiers_config.py (config) - Map

## Summary

`model_tiers_config.py` provides a structured metadata layer for categorizing LLMs into user-friendly "Packs" (Essential, Professional, Enterprise). It defines hardware requirements (RAM/VRAM), disk space estimates, and primary use cases for each model. while currently treated as a reference file for future UI enhancements, it serves as the knowledge base for "Tool Support" verification and installation time estimates.

---

## Technical Map

### Data Models (Lines 13-33)

- **`ModelInfo`**: Captures granular details like `size`, `tool_support` (boolean), `recommended_hardware`, and legal `license` information.
- **`ModelTier`**: Groups models into cohesive units with aggregate `total_size`, `disk_space_gb`, and `ram_requirements_gb`.

### Tier Definitions (Lines 36-212)

- **Essential Pack**:
  - **Models**: `llama3.2:3b`, `qwen2.5:3b`, `nomic-embed-text`.
  - **Target**: Users with 8GB RAM. Focuses on fast responses and basic memory operations.
- **Professional Pack**:
  - **Models**: `gpt-oss:20b`, `qwen2.5:7b`, `llama3.1:8b`, `phi4:14b`.
  - **Target**: Users with 16GB RAM. Balanced reasoning for code assistance and deep memory search.
- **Enterprise Pack**:
  - **Models**: `gpt-oss:120b`, `llama3.1:70b`, `qwen2.5:72b`, `command-r:35b`.
  - **Target**: High-end workstations / H100 GPUs (32GB+ RAM). Advanced multi-step tool use and complex research.

### Specialized Entries (Lines 216-227)

- **`firefunction-v2`**: Categorized as a "Specialist" model specifically for structured API interactions and function calling.

---

## Connection & Dependencies

- **model_switcher_router.py**: Reference for recommending models to users based on their hardware detected at runtime.
- **SettingsModal (UI)**: Uses the metadata (vram, ram) to warn users if a selected model exceeds their local resources.
- **Ollama Required Modal**: Uses the "Essential" definitions to suggest the first set of models for new RoamPal installations.

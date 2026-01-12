# model_registry.py (routers) - Map

## Summary

`model_registry.py` serves as the "Intelligence Catalog" for RoamPal. It is a unified registry that maintains hardcoded metadata for dozens of LLM variants, manages quantization levels (Q2_K to Q8_0), and implements sophisticated hardware detection to recommend the best model for a user's specific GPU. It also defines highly important "tiers" (Verified/Compatible/Experimental) based on how reliably a model handles RoamPal's tool-calling logic.

---

## Technical Map

### Hardware Intelligence

- **GPU Detection (`detect_gpu_info`)**: Executes `nvidia-smi` to query VRAM capacity, free memory, and current utilization.
- **Smart Recommendations (Lines 610-669)**: Cross-references available VRAM with the `QUANTIZATION_OPTIONS` table to suggest models. It enforces a 2GB headroom safety margin and provides warnings for low-VRAM environments.

### Model Catalog (`QUANTIZATION_OPTIONS`)

- **VRAM Fingerprinting**: Maps every model/quantization pair to a specific `vram_gb` requirement and `quality` rating (1-5).
- **Tool-Calling Tiers (Lines 254-310)**:
  - **Verified**: Models like `qwen2.5` and `llama3.3:70b` which are confirmed to work with RoamPal's memory tools.
  - **Compatible**: Likely to work but untested.
  - **Experimental**: Models like `deepseek-r1` or `gemma2` which may struggle with structured tool execution.

### Unified Registry Endpoint

- **Multi-Provider Discovery (Lines 392-508)**: `/api/model/registry` queries both Ollama and LM Studio to build a real-time list of installed models, enriched with metadata from the hardcoded catalog (context window, tier, size).
- **GGUF Mapping**: Connects local model names to their upstream HuggingFace repositories and specific GGUF file paths for the ingestion pipeline.

---

## Connection & Dependencies

- **model_switcher.py**: Heavily dependent on this registry to validate whether a model download should proceed based on available VRAM.
- **config/model_contexts.py**: Supplies default context window sizes for the registry entries.
- **nvidia-smi (External)**: Required for hardware-aware model recommendations on NVIDIA systems.
- **Model Download UI**: Uses the catalog to populate the list of "Popular Models" available for one-click installation.

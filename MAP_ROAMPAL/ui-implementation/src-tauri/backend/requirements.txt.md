# requirements.txt (backend) - Map

## Summary

`requirements.txt` manages the Python ecosystem dependencies for the RoamPal backend. It ensures a stable environment by pinning versions for the web framework, AI/ML libraries, document parsers, and vector storage. The selection of packages highlights RoamPal's focus on local-first intelligence (embeddings, local LLMs) and versatile data ingestion (PDF, Word, Excel).

---

## Technical Map

### Framework & Networking (Lines 1-13)

- **FastAPI (0.104.1)**: The core web engine.
- **HTTPX**: The modern asynchronous HTTP client used to communicate with LLM providers like Ollama.
- **Starlette**: The underlying ASGI toolkit for FastAPI.

### AI & Vector Intelligence (Lines 14-22, 46-56)

- **ChromaDB (1.x)**: High-performance vector storage for long-term memory.
- **Sentence-Transformers (2.2.2)**: Used to generate high-quality text embeddings locally.
- **PyTorch (2.x)**: The deep learning foundation for local model execution.
- **Transformers (4.x)**: Interface for pre-trained weights from HuggingFace.
- **NLTK / TextBlob / VaderSentiment**: Traditional NLP libraries used for metadata extraction and sentiment-based memory weighting.

### Document Ingestion (Lines 57-74)

- **Enhanced Processing**: Support for various file formats including:
  - **PDF**: PyPDF2 (basic) and PyMuPDF (advanced/OCR).
  - **Word**: python-docx and docx2txt.
  - **Browser**: Playwright and BeautifulSoup4 for web scraping.
  - **Structured**: Openpyxl (Excel) and striprtf (RTF).
- **LangChain (0.3.x)**: Orchestrates complex document sharding and semantic chunking via `SmartBookProcessor`.

### LLM Integrations (Lines 83-89)

- **Ollama**: specifically pins a GitHub commit of the official Python SDK for stability.
- **LMStudio**: Includes the official SDK for multi-provider support.
- **HuggingFace Hub**: For downloading and management of GGUF model files.

---

## Connection & Dependencies

- **main.py**: Imports the majority of these libraries during the `lifespan` initialization.
- **SmartBookProcessor.py**: Heavily dependent on the document processing and LangChain pins.
- **EmbeddingService.py**: Relies on `sentence-transformers` and `torch`.
- **Tauri Bundle**: This file is used to build the virtual environment packaged within the `binaries/python` directory.

# schemas.py (models) - Map

## Summary

`schemas.py` defines the core Pydantic data structures used for structured extraction and memory classification. These models represent the "atomic units" of RoamPal's intelligence—Quotes, Mental Models, and Semantic Summaries. they are used to validate LLM outputs during document ingestion and pattern recognition.

---

## Technical Map

### Data Structures

- **`Quote`**: Encapsulates a verbatim string (`quote`) and its immediate linguistic `context`. Used for high-fidelity evidence retrieval.
- **`Model`**: Represents an abstract concept, framework, or methodology (`name`) with a supporting `description`. Used for the "Knowledge Graph" and pattern mining.
- **`Summary`**: A distilled list of `key_points` and a characterization of the `tone`. Used to provide the LLM with "Long-term Historial" summaries during chat.

---

## Connection & Dependencies

- **SmartBookProcessor.py**: Uses these classes as response formats for the LLM when extracting insights from large documents.
- **UnifiedMemorySystem.py**: Serializes these structures when storing fragments in ChromaDB.
- **AgentChatService.py**: Renders these objects into the system prompt to ground the AI's responses in specific user-relevant data.

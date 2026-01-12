# default_config.yaml (config) - Map

## Summary

`default_config.yaml` provides the baseline static configuration for the RoamPal backend. It defines standard ports, fallback model names (`llama3:8b`), and default file paths for legacy-style storage (goals, values, scores). While the `settings.py` (Pydantic) system has largely superseded this file for runtime operations, it remains a template for new local installations.

---

## Technical Map

### Core Sections

- **`app`**: Sets the default service name and `INFO` logging level.
- **`llm`**: Configured for local `ollama` with a 5-minute timeout (`300s`) and a 1-minute keep-alive.
- **`memory`**: Maps to an initial `data/` directory. Provides filenames for high-level core beliefs (goals and values).
- **`web_search`**: points to a separate playwright service on port 8001.
- **`scoring`**: references a `scores.json` file for the legacy weighting system.
- **`prompt`**: defines the internal path for the raw text templates used to build LLM instructions.

---

## Connection & Dependencies

- **Settings.py**: Uses this file as a secondary fallback if environment variables are not present.
- **`load_dotenv`**: Often used in conjunction with this file to populate the process environment.

# personality_manager.py (routers) - Map

## Summary

`personality_manager.py` handles the customization of the agent's identity, communication style, and response behavior. It manages a filesystem-based template system where YAML-formatted instruction sets are stored as `.txt` files in `presets/` (read-only system templates) or `custom/` (user-defined templates). The logic ensures that templates are validated for correctness before being copied to a specialized `active.txt` file, which is then consumed by the LLM prompt engine to set the agent's tone.

---

## Technical Map

### Template Organization (Lines 18-27)

- **`presets/`**: Contains factory personalities (e.g., "Default", "Skeptical Philosopher", "Expert Coder").
- **`custom/`**: Stores user-created or uploaded templates.
- **`active.txt`**: The specific file that acts as the current "Soul" of the agent.

### Validation & Parsing (Lines 48-82)

- **`_validate_template`**: parses the template as YAML and enforces a strict schema. templates MUST identify `identity` and `communication` blocks. It verifies that `identity.name` is present, as this is used for UI breadcrumbs and chat bubbles.
- **`_get_template_name`**: extracts the `role` field from the YAML to display a human-readable title in the template list.

### Management Endpoints (Lines 84-337)

- **`/presets`**: lists available IDs from both system and user folders.
- **`/current`**: identifies the active personality by comparing the `active.txt` content hash against all available templates.
- **`/save` & `/upload`**: sanitizes file names (to prevent path traversal) and writes new YAML instruction sets to the `custom/` directory.
- **`/activate`**: the key endpoint for switching personalities. It performs a final validation check before performing a `shutil.copy2` to the `active.txt` destination.
- **`/delete`**: allows removal of user templates but blocks deletion if the template is currently active.

---

## Connection & Dependencies

- **PromptEngine.py**: reads the `active.txt` file produced by this router and injects it into the `{{ SYSTEM_PROMPT }}` variable for every LLM request.
- **SettingsModal (Frontend)**: The "Personality" tab uses these endpoints to allow users to click between different personas.
- **Advanced Editor**: the `POST /save` endpoint is used by the in-app code editor for YAML-based persona fine-tuning.

# common_utils.py (utils) - Map

## Summary

`common_utils.py` contains low-level auxiliary functions that provide robust data handling for the RoamPal backend. Its primary features include a template formatter with strict variable checking and a sophisticated `_repair_json` utility designed to fix common LLM hallucinations (e.g., missing brackets, incorrect quoting, and markdown code block artifacts).

---

## Technical Map

### Template Management (Lines 9-26)

- **`load_prompt_template(path, **kwargs)`\*\*:
  - Reads raw text files (typically from `/prompts`).
  - Uses `string.Formatter().parse()` to dynamically identify all `{placeholder}` variables.
  - **Safety**: Raises a descriptive `KeyError` if any variables required by the template are missing from the provided `kwargs`, preventing malformed LLM prompts.

### JSON Resiliency (Lines 28-53)

- **`_repair_json(raw)`**:
  - A multi-stage regex engine designed to extract and fix JSON data from noisy LLM outputs.
  - **Key Fixes**:
    - Strips markdown triple-backticks (` ```json `).
    - Automatically balances curly braces `{}` and square brackets `[]`.
    - Replaces single quotes with double quotes.
    - Fixes trailing commas before closing braces.
    - Attempts `ast.literal_eval` as a secondary fallback if standard `json.loads` fails.

### Filesystem IO (Lines 55-67)

- **`_read_json` / `_write_json`**: Wrappers for standard JSON file operations that provide automatic pretty-printing (4-space indent) and silent failure with empty defaults for missing files.

---

## Connection & Dependencies

- **modules.prompt**: Inherits and uses `load_prompt_template` to prepare instructions for Ollama.
- **AgentChatService.py**: Relies on `_repair_json` to parse the structured "thoughts" and "tool calls" of the agent, which are frequently wrapped in markdown or contain minor syntax errors.
- **config.settings**: Uses the JSON IO helpers to manage `feature_flags.json` and `user_model_contexts.json`.

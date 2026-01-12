# ModelContextSettings.tsx - Map

## Summary

`ModelContextSettings.tsx` is the fine-tuning interface for managing LLM context windows. It allows users to adjust the amount of memory (in tokens) each installed model can address. The modal handles differential logic for Ollama (local overrides) vs. LM Studio (externally managed) and provides safety rails based on each model's theoretical maximum limit.

---

## Technical Map

### Component Props (`ModelContextSettingsProps`)

- `isOpen`: Controls visibility.
- `onClose`: Callback to dismiss the modal.
- `currentModel`: The model currently selected in the main chat.
- `currentProvider`: The backend provider (Ollama/LM Studio).

### State & Logic

#### Context Discovery (Lines 33-88)

- **Scanning**: Hits `GET /api/model/available` to find installed models.
- **Polling Info**: For each found model, it uses `modelContextService.getModelContext(modelName)` to fetch the current, default, and maximum token support.
- **Sorting**: Prioritizes the "Active" model (matching `currentModel`) to the top of the list.

#### Context Mutation (Lines 90-123)

- **Override**: Hit `modelContextService.setContextSize(model, newValue)`. Updates local state immediately for a lag-free UI experience.
- **Reset**: Hit `modelContextService.resetContextSize(model)` to return to factory defaults.

#### Formatting (Lines 125-130)

- `formatTokens`: Converts raw integers into readable "K" units (e.g., `32768` → `33K`).

### UI Structure

- **Header (Lines 144-160)**: Explanatory text about context window impact.
- **Empty State (Lines 169-175)**: Visual fallback if no models are detected.
- **Model Cards (Lines 183-251)**:
  - **Status Badges**: "Active" (Blue) for current model, "Custom" (Yellow) if defaults are overridden.
  - **Provider Logic**: If `provider === 'lmstudio'`, the slider is disabled with a `opacity-40` class and a warning message (since LM Studio manages context in its own GUI).
  - **The Slider**: A range input (`min 512`, `max {model_max}`) for granular control. Uses custom CSS for a blue webkit-thumb (Lines 278-295).
- **Footer (Lines 257-275)**: Informational text about the trade-off between larger context and RAM/VRAM consumption.

---

## Connection & Dependencies

- **modelContextService.ts**: The backend service wrapper for token logic.
- **ConnectedChat.tsx**: Typically triggers this modal from a "Settings" or "Model" menu.
- **apiFetch.ts**: Used to retrieve the base list of installed models.

# usePreferenceStore.ts - Map

## Summary

`usePreferenceStore.ts` is a specialized Zustand store that manages user-facing UI toggles and preferences. It primarily governs "Transparency" settings, which control how much of the AI's internal reasoning (thinking, alternative queries, confidence scores) is visible in the chat interface. It uses persistence middleware to ensure user choices survive app restarts and page refreshes.

---

## Technical Map

### State Schema (`TransparencyPreferences`)

- **`transparencyLevel`**: (`none` | `summary` | `detailed`) - Controls the depth of metadata shown for tool executions and RAG retrieval.
- **`autoExpandThinking`**: Boolean - If true, the "Thinking" section in assistant messages starts in an expanded state.
- **`thinkingPosition`**: (`inline` | `sidebar`) - Determines if reasoning steps are shown within the bubble or in a separate UI region.
- **`showConfidence`**: Boolean - Toggles visibility of RAG matching percentages.
- **`showAlternatives`**: Boolean - Toggles visibility of query expanding/rephrasing steps.

### Actions

- **Setters**: Granular functions (`setTransparencyLevel`, `setAutoExpand`, etc.) to update individual preference keys.
- **`resetToDefaults`**: Resets the store back to the `summary` level with confidence/alternatives enabled.

### Persistence (Lines 60-70)

- **Engine**: `localStorage` (via Zustand `persist` middleware).
- **Key**: `loopsmith-transparency-preferences`.
- **Note**: Only the core preference flags are partialized for storage; actions are excluded.

---

## Connection & Dependencies

- **EnhancedChatMessage.tsx**: Uses these flags to decide which sub-components (like `ToolExecutionDisplay`) to render or hide.
- **EnhancedMessageDisplay.tsx**: Checks `showConfidence` and `autoExpandThinking` for rendering citations.
- **Settings/Personality Panels**: Typically provide the UI controls to mutate these values.

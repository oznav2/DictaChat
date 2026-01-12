# PersonalityCustomizer.tsx - Map

## Summary

`PersonalityCustomizer.tsx` is the primary interface for shaping the AI assistant's persona. It allows users to modify the YAML-based personality configuration that governs the AI's name, role, tone, verbosity, and memory-usage priorities. The component offers both a guided "Quick Settings" UI and an "Advanced" YAML editor with real-time validation and error reporting.

---

## Technical Map

### Core Logic

#### Configuration Schema (Lines 31-58)

Governs fields such as:

- **Identity**: `name`, `role`, `background`.
- **Communication**: `tone` (warm/direct/etc), `verbosity`, `formality`, and boolean flags for analogies, examples, and humor.
- **Memory**: `priority` (always/relevant) and `pattern_trust`.
- **Custom Instructions**: A raw markdown block for bespoke behavior.

#### YAML Pipeline (Lines 175-192)

- Uses `js-yaml` to parse and dump configurations.
- Implements real-time validation; syntax errors are caught and surfaced with line-level accuracy to the user.
- **Bi-directional Sync**: Changes in the Quick Settings dropdowns automatically regenerate the YAML buffer, and manual YAML edits (if valid) update the Quick Settings state.

#### Activation Workflow (Lines 252-299)

1. **Save**: `POST /api/personality/save` sends the YAML content to the backend.
2. **Activate**: `POST /api/personality/activate` makes the saved configuration the active system prompt.
3. **Event Notify**: Dispatches a `personalityUpdated` global window event to update names and avatars in the chat thread without a page refresh.

### UI Structure

#### Mode Toggle (Lines 428-449)

Switches between:

- **Quick Settings**: A list of labeled inputs and dropdowns (defined in `QUICK_SETTINGS` constant).
- **Advanced**: A full-height monospaced `<textarea>` for direct YAML manipulation.

#### Quick Settings Controls (Lines 451-515)

- **Text Inputs**: For names and roles.
- **Selects**: With icon-augmented labels for tone and length.
- **Toggles**: Stylized buttons for boolean flags like "Use Humor".

#### Advanced Editor (Lines 518-557)

- Integration of a "Load Example" helper to reset to a known-good template.
- Red border and error banner feedback for syntax violations.

#### Action Hub (Lines 560-602)

- **Save Changes**: Multi-state button (Idle -> Saving -> Success).
- **Reset**: Reverts to the last server-saved version.
- **Export**: Triggers a local browser download of the `.txt` (YAML) configuration.

---

## Connection & Dependencies

- **js-yaml**: Third-party library for configuration parsing.
- **SettingsModal.tsx**: Usually hosts this component as a sub-tab.
- **EnhancedChatMessage.tsx**: Listens for the `personalityUpdated` event to refresh assistant branding.
- **Backend API**:
  - `/api/personality/presets` (GET)
  - `/api/personality/current` (GET)
  - `/api/personality/save` (POST)
  - `/api/personality/activate` (POST)
  - `/api/personality/template/{id}` (GET)

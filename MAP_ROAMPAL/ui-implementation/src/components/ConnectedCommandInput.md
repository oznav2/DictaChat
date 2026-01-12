# ConnectedCommandInput.tsx - Map

## Summary

`ConnectedCommandInput.tsx` is the primary input component for RoamPal. It's a "connected" component that bridges the raw user input with the `useChatStore`. It features a smart, auto-expanding textarea, slash command support with a visual command palette, and special handling for memory-related trigger commands (e.g., `!memory`). It also manages the "Stop/Cancel" state when the LLM is generating a response.

---

## Technical Map

### Core Dependencies

- **State**: `useChatStore.ts` (Zustand) for message orchestration.
- **Icons**: `@heroicons/react` (PaperAirplaneIcon).
- **Hooks**: `useState`, `useRef`, `useEffect`.

### Component Logic

#### Textarea Management (Lines 35-50)

- **Auto-Resize**: An `useEffect` hook calculates `scrollHeight` on every keystroke.
- **Bounds**: Height is constrained between 24px (1 line) and 208px (~10 lines), after which it starts scrolling.

#### Command Palette (Lines 27-32, 53-67)

- **Triggers**: Detecting `/` at the start of the message.
- **Commands**:
  - `/memory search [query]`: Triggers `searchMemory`.
  - `/memory save [text]`: Placeholder for saving memory.
  - `/clear`: Resets the current chat session.
  - `/help`: Dumps usage info to logs.
- **Visuals**: A floating absolute-positioned div (`bottom-full`) appears when commands are active.

#### Message Dispatch (Lines 94-134)

- **Sanitization**: Prevents empty messages or double-sends during processing.
- **Routing**:
  1. **Slash Commands**: If starts with `/`, routes to `COMMANDS` handlers only.
  2. **Inline Memory Triggers**: If contains `!memory`, it extracts the action (recent/search) and triggers a memory search _before_ or _during_ sending the message to the LLM.
  3. **Standard Message**: Triggers `sendMessage(message)`.

#### Keyboard Shortcuts (Lines 136-163)

- **Navigation**: ArrowUp/Down to navigate the command palette.
- **Auto-Complete**: Tab/Enter to select a command from the palette.
- **Send**: Enter (without Shift) or Meta+Enter (Command/Ctrl + Enter) to trigger `handleSend`.

### UI Structure (Return JSX)

- **Command Palette (Lines 168-190)**: Renders matches for slash commands.
- **Main Wrapper (Line 193)**: High-contrast `zinc-950` rounded container with focus-ring effects.
- **Textarea (Lines 196-206)**: Unstyled native textarea with `resize-none`.
- **Action Button (Lines 210-228)**:
  - **Idle**: PaperAirplane icon.
  - **Processing**: Rotating X (Stop) button that triggers `cancelProcessing`.
- **Status Bar (Lines 233-242)**: Small zinc-colored text showing keyboard hints and current processing state.

---

## Connection & Dependencies

- **useChatStore.ts**: Directly calls `sendMessage`, `searchMemory`, and `cancelProcessing`.
- **TerminalMessageThread.tsx**: Receives the messages that originate here.
- **Logger**: Emits debug/info logs for help commands.

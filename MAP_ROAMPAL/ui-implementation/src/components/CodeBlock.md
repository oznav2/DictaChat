# CodeBlock.tsx - Map

## Summary

`CodeBlock.tsx` is a reusable UI component for displaying source code with syntax highlighting labels and action buttons. It provides functionality for copying code to the clipboard, running code (for supported languages like Python and JavaScript), and applying code changes to specific files.

---

## Technical Map

### Core Dependencies

- **Icons**: `lucide-react` (CopyIcon, CheckIcon, PlayIcon, FileIcon).

### Component Props (`CodeBlockProps`)

- `code`: The source code string to display.
- `language`: (Optional) The programming language for labeling. Defaults to `plaintext`.
- `filename`: (Optional) The name of the file associated with the code.
- `onApplyToFile`: (Optional) Callback function to apply the code to a file.
- `onRun`: (Optional) Callback function to execute the code.

### Component Logic

- **Copy to Clipboard (Lines 21-29)**: Uses `navigator.clipboard.writeText` to copy the code. It manages a `copied` state to show a checkmark icon temporarily.
- **Run Handler (Lines 31-35)**: Invokes the `onRun` callback if provided.
- **Apply Handler (Lines 37-41)**: Invokes the `onApplyToFile` callback if a filename is provided.

### UI Structure

- **Container**: A rounded `gray-900` div with a header and content area.
- **Header (Lines 46-91)**:
  - Displays the language and optional filename.
  - Contains action buttons:
    - **Run**: Shown for supported languages if `onRun` is provided.
    - **Apply**: Shown if `onApplyToFile` and `filename` are provided.
    - **Copy**: Always shown, toggles between copy and checkmark icons.
- **Code Content (Lines 94-98)**: A `<pre>` and `<code>` block for the source code, using standard language classes.

---

## Connection & Dependencies

- Used by markdown renderers or message displays to present code snippets found in LLM responses.
- Relies on external styling or Prism/Highlight.js (implied by `language-` classes) for actual syntax coloring if not handled by standard CSS.

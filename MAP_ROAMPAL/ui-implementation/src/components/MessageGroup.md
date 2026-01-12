# MessageGroup.tsx - Map

## Summary

`MessageGroup.tsx` is a layout component that bundles multiple consecutive messages from the same sender into a single, unified "speech bubble" cluster. It handles distinct styling for user, assistant, and system roles, and includes internal logic for basic markdown parsing (bold, code blocks) and command badge rendering.

---

## Technical Map

### Component Props (`MessageGroupProps`)

- `messages`: Array of `Message` objects to be grouped.
- `sender`: Identifier for the sender role (`user`, `assistant`, or `system`).
- `timestamp`: Date object for the group's arrival.
- `onMemoryClick`: Callback for interactive memory elements.
- `onCommandClick`: Callback for clickable slash commands.

### Senders & Roles

#### System Messages (Lines 37-45)

- Rendered as a centered, minimal badge with a `zinc-900/50` background and `zinc-500` text.

#### User & Assistant (Lines 48-161)

- **User**: Right-aligned, blue gradient background (`blue-600/20`), right-anchored "tail" for the bubble.
- **Assistant**: Left-aligned, zinc background (`zinc-900/50`), left-anchored "tail", features a gradient avatar with the initial "R".

### Internal Rendering Logic

#### `renderMessageContent` (Lines 179-249)

- **Code Blocks**: Manual parsing of triple-backtick segments into `<pre><code>` blocks.
- **Commands**: Lines starting with `/` or `!` are rendered as blue clickable badges.
- **Bold Text**: Manual parsing of `**` delimiters into semantic `<strong>` tags.
- **Line Breaks**: Automatically injects `<br />` for newline characters.

#### Attachments (Lines 79-93)

- Loops through message attachments and renders them as small gray badges with file icons, names, and human-readable sizes (KB/MB).

#### Citations (Lines 97-124)

- Displays simplified inline sources with numeric indices and confidence-matching percentages.

### Styling Elements

- **Bubble Tail (Lines 148-159)**: A rotated absolute-positioned square used to create the speech bubble pointer effect for both user and assistant roles.

---

## Connection & Dependencies

- **MemoryCitation.tsx**: Used for displaying retrieved context within the group.
- **MessageThread.tsx**: The parent component that orchestrates these groups.
- Used in older UI versions where full markdown engines were not yet integrated into every message card.

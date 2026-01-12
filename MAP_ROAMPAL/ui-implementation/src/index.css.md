# index.css - Map

## Summary

`index.css` defines the core design system for RoamPal. It leverages Tailwind CSS layer directives to establish a consistent, low-fatigue visual aesthetic tailored for long-term usage. It features a dark-first color palette, custom scrollbar styling, and high-performance CSS animations for AI processing states.

---

## Design System

### Base Styles (Lines 6-76)

- **Typography**: Uses `antialiased` rendering and a monospaced font family for code blocks (`sm` text with `zinc-100` coloring).
- **Global Layout**: Forces an overflow-hidden 100vh viewport (`height: 100vh; overflow: hidden`) to prevent standard browser scrollbars on the main application shell.
- **Scrollbars**: Customized `webkit` scrollbars with a `zinc-900` track and `zinc-700` rounded thumbs for a subtle, integrated look.
- **Selections**: Semi-transparent blue highlights (`blue-500/30`).

### Markdown & Content Layout (Lines 55-71)

- **Safety**: `.markdown-content` class enforces aggressive word-breaking and overflow-wrap to prevent wide text blocks from breaking the terminal layout.
- **Code**: Inline code handles long strings by allowing wrapping, while block code (`pre`) enables horizontal scrolling.

### Custom Animations (Lines 95-192)

- **`animate-typing`**: A 1.4s opacity cycle used for the "Typing" indicator.
- **`animate-fadeIn`**: A quick scale-and-fade entry for new modals or message cards.
- **`animate-pulse-subtle`**: A high-efficiency `2s` cubic-bezier pulse used for background task identifiers.
- **`animate-enhanced-pulse`**: A more aggressive scale-and-opacity pulse used for critical loading states.

---

## Connection & Dependencies

- **main.tsx**: Imports this file as the application entry point.
- **TerminalMessageThread.tsx**: heavily relies on `.markdown-content` and `.animate-pulse-subtle` for rendering the AI's internal state.
- **ConnectedChat.tsx**: Uses `bg-black` and `text-zinc-100` as the foundation for the entire layout.

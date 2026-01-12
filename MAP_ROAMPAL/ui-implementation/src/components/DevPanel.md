# DevPanel.tsx - Map

## Summary

`DevPanel.tsx` is a debugging interface placeholder for RoamPal developers. It currently provides a basic modal skeleton that can be extended with internal tools, system logs, or feature toggles.

---

## Technical Map

### Component Props (`DevPanelProps`)

- `isOpen`: Controls visibility.
- `onClose`: Callback to dismiss the panel.

### UI Structure

- **Backdrop**: Standard `black/50` fixed inset.
- **Container**: A `zinc-900` card centered on the screen.
- **Header**: Simple flexbox with a "Developer Panel" title and an SVG "X" close button.
- **Content**: A single text label placeholder for future debugging options.

---

## Connection & Dependencies

- Triggered usually from a keyboard shortcut or a hidden setting in `ConnectedChat.tsx`.
- Currently minimal logic; acts primarily as a UI shell.

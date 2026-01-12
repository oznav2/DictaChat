# stubs.tsx - Map

## Summary

`stubs.tsx` is a utility file containing placeholder components for various UI elements that are either under development, deprecated, or moved to other files. These stubs prevent "component not found" errors during the refactoring process and serve as base templates for future features like Voice Conversations, Sleep Mode, and Image Analysis.

---

## Technical Map

### Placeholder Components

Most stubs follow a standard pattern: a centered modal with a title and a "Close" button.

- **`ImageAnalysis`**: Placeholder for visual reasoning features.
- **`ShardCreationModal` / `ShardBooksModal`**: Placeholders for granular memory sharding (logic largely subsumed by `BookProcessorModal`).
- **`LoginModal`**: Placeholder for potential multi-user auth (currently RoamPal is single-user local).
- **`ProcessingBubble`**: A simple pulsing "Processing..." text block.
- **`VoiceConversationModal` / `VoiceSettingsModal`**: Future-facing slots for audio/STT/TTS integration.
- **`ProfileSettings`**: Placeholder for user identity settings.
- **`SleepMode`**: Placeholder for system standby or privacy modes.

### Compatibility Aliases (Line 39)

- **`ShardManagementModal`**: Re-exports `BookProcessorModal` under this legacy name to maintain backward compatibility with older components that still use the "Shard" terminology.

---

## Connection & Dependencies

- **Sidebar.tsx / ConnectedChat.tsx**: Typically import these placeholders to fill out the UI before final feature implementation.
- **BookProcessorModal.tsx**: Dependency for the `ShardManagementModal` alias.

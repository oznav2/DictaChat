# Sidebar.tsx - Map

## Summary

The `Sidebar` component provides the primary navigation and session management interface for RoamPal. It displays the active assistant's name (dynamically fetched from the personality settings), a "New Conversation" button, and a chronological history of chat sessions grouped by date (Today, Yesterday, This Week, etc.). It enables users to switch between conversations, delete sessions (via `DeleteSessionModal`), and access quick action panels like "Personality & Identity", "Document Processor", and "Settings". It subscribes directly to the `useChatStore` for real-time session updates.

---

## Technical Map

### Imports

- **Line 2**: HeroIcons for UI elements (`PlusIcon`, `TrashIcon`, etc.).
- **Lines 3-7**: Store and service dependencies (`useChatStore`, `modelContextService`, `apiFetch`, `ROAMPAL_CONFIG`).
- **Line 6**: `DeleteSessionModal` for confirmation logic.

### Interfaces

- **Lines 9-24**: `SidebarProps` - Defines callbacks for shard changes, session selection, deletion, and opening various modals.
- **Lines 27-33**: `ChatSession` (Internal) - A transformed structure of the store's session data for easier rendering in the sidebar.

### Component Logic (`Sidebar`)

#### State & Store Subscription

- **Line 58-61**: Local state for menus, assistant name, model limits, and the session currently targeted for deletion.
- **Line 64**: `useChatStore` subscription fetching `state.sessions`.
- **Lines 68-74**: **Data Transformation**: Maps raw store sessions to the internal `ChatSession` format, converting unix timestamps to JS `Date` objects.

#### Side Effects

- **Lines 77-102**: Fetches the assistant's name from `/api/personality/current` on mount and every 5 seconds. Uses a regex (Line 84) to extract the name from potentially quoted YAML values.
- **Lines 105-119**: Fetches model context window limits via `modelContextService.getAllContexts`.

#### UI Sections

- **Header (Lines 136-152)**: Shows the active assistant name and a platform-aware collapse button.
- **New Chat Button (Lines 155-171)**: Large call-to-action button, disabled if no model is detected.
- **Chat History (Lines 174-215)**:
  - Calls `groupChatsByDate` (Line 131) to organize sessions.
  - Iterates through date groups and sessions.
  - Shows a color-coded shard indicator (Line 188).
  - Features a hover-sensitive delete button (Line 198).
- **Quick Actions (Lines 218-234)**: Fixed navigation links at the bottom of the sidebar.
- **Modals (Lines 237-246)**: Inline `DeleteSessionModal` integration.

### Helper Functions (Lines 253-318)

- **`groupChatsByDate`**: Sorts sessions by time descending and categorizes them into 'Today', 'Yesterday', 'This Week', or specific dates.
- **`isToday`, `isYesterday`, `isThisWeek`**: Standard date matching utilities.
- **`formatDate`, `formatTime`**: Localizes labels for the UI.

---

## Connection & Dependencies

- **useChatStore**: Primary data source for the session list.
- **DeleteSessionModal**: Secondary component for destructive actions.
- **modelContextService**: Used to reflect system capacities.
- **Backend API**: Depends on `/api/personality/current` and session list logic via store.

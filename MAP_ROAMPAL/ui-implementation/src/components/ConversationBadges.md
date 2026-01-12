# ConversationBadges.tsx - Map

## Summary

`ConversationBadges.tsx` is a component for managing and displaying a list of chat sessions in the sidebar. It provides a visual, card-based list where each "badge" represents a single conversation, showing its title, preview text, message count, and last activity time. It handles internal fetching of the conversation list and provides callbacks for selection, deletion, and creation.

---

## Technical Map

### Component Props (`ConversationBadgesProps`)

- `activeConversationId`: Currently selected session ID for highlighting.
- `onSelectConversation`: Callback for switching sessions.
- `onDeleteConversation`: Callback for deleting a session.
- `onNewConversation`: Callback for creating a fresh session.

### State management

- `conversations`: Array of `Conversation` objects fetched from the server.
- `loading`: Boolean toggle for the initial loading spinner.

### Core Logic

#### Data Fetching (Lines 34-70)

- Calls `GET /api/conversations`.
- **Mock Data**: Includes a robust fallback mechanism for development environments if the API call fails, providing sample "API Optimization", "Debug Session", and "Code Review" entries.

#### Formatting (Lines 72-83)

- `formatTime`: Converts JavaScript `Date` objects into compact relative strings (e.g., "now", "10m", "5h", "2d").

### UI Structure

- **Badge Container (Lines 86-184)**: A 320px wide (80 rem) flex column with a fixed height.
- **Header (Lines 88-99)**: Features a pulsing blue dot and a "+ New" button for global session creation.
- **Badge Items (Lines 114-170)**:
  - **Active Highlighting**: Uses `blue-600/20` background and a shadow glow if the badge matches the `activeConversationId`.
  - **Hover Effects**: Scales the card up slightly (`scale-[1.02]`) and reveals a delete (trash) button.
  - **Metadata Layout**:
    - Top: Title + Delete button.
    - Middle: Truncated message preview.
    - Bottom: Message count indicator and last activity time.
- **Footer (Lines 175-181)**: Displays aggregate statistics, including total conversation count and sum of all message counts.

---

## Connection & Dependencies

- **apiFetch.ts**: For direct communication with the `/api/conversations` endpoint.
- **heroicons**: Standard UI iconography.
- **Sidebar.tsx**: Often used as the child component that occupies the navigation area of the main app.

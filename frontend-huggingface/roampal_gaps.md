# Roampal vs BricksLLM — Remaining Parity Gaps (Backlog Only)

**Last Verified:** January 11, 2026

This document intentionally includes **only** features that are **not implemented** or **partially implemented**. Everything marked “✅ Implemented + wired” has been moved to project tracking:

- [STATUS.md](file:///home/ilan/BricksLLM/STATUS.md)
- [tasks/TODO.md](file:///home/ilan/BricksLLM/tasks/TODO.md)

## Definition of Done (for every item here)

An item can be marked ✅ only when:

- Backend/API exists (if applicable) with stable JSON schema.
- UI is wired and visible (not “endpoint exists but never called”).
- Refresh works without hard reload (event bus/polling/invalidations).
- Error states are shown in UI.
- `npm run check` and `npm run lint` pass.

## Remaining / Partial Items

### A) Memory UI Parity

#### A1) FragmentBadges parity: score bars inside SourceBadge (🟨 Partial)

- **Current:** score visualization exists in memory UI rows, but `SourceBadge` is still a simple attribution pill.
- **Goal:** Roampal-style score/quality indicator bars rendered alongside the SourceBadge attribution.
- **Where:** Memory list rows + detail drawer where SourceBadge is used.
- **Code pointers:**
  - Existing score bar logic: `src/lib/components/memory/MemoryPanel.svelte`
  - Target component: `src/lib/components/memory/SourceBadge.svelte`
- **Acceptance:** every memory row shows a consistent bar (same thresholds/colors) and it works in both list + details.

#### A2) MemoryHealthPanel “derived” metrics (🟨 Partial)

- **Current:** system/parity endpoints are wired; some derived metrics are placeholders (cache hit rate / promotion / demotion).
- **Goal:** either compute these metrics correctly (preferred) or remove them from the UI to avoid misleading “N/A”.
- **Code pointer:** `src/lib/components/memory/MemoryHealthPanel.svelte`
- **Acceptance:** no placeholder metrics remain; every displayed metric maps to a real backend source.

### B) Settings & Modal Parity

#### B1) Settings nested modal flow + provider detection polish (⏳ Not implemented)

- **Goal:** Roampal-style nested settings experience (sub-panels without losing context) + reliable provider detection display.
- **Where:** settings routes and navigation.
- **Acceptance:** user can drill into sub-settings and back out without losing state; keyboard navigation remains correct.

#### B2) DataManagement bulk ops (🟨 Partial)

- **Current:** backup export/import exists; bulk delete/archive workflows are missing.
- **Goal:** bulk-select + bulk actions (delete/archive/cleanup) with progress and confirmation.
- **Where:** MemoryBankModal and/or settings/backup.
- **Acceptance:** user can select N items, run an operation, see progress, and results are reflected without reload.

#### B3) Integrations panel (non‑MCP) (⏳ Not implemented)

- **Note:** MCP server management exists; this item is specifically for non‑MCP integrations (connectors, feature flags, credentials UX).
- **Acceptance:** integrations can be configured safely and status is visible.

#### B4) Backup parity extras (🟨 Partial)

- **Current:** export/import works.
- **Missing parity pieces:**
  - `GET /api/memory/backup/estimate` (counts + approximate bytes)
  - “restore wrapper” that auto-creates a pre-restore snapshot (server-side or local-download workflow)
- **Acceptance:** user sees size estimate before export, and restore never happens without a pre-restore snapshot.

### C) Knowledge Graph Service Parity

#### C1) Debounced KG saves (⏳ Not implemented)

- **Goal:** prevent write amplification and race conditions under burst updates.
- **Acceptance:** burst updates don’t flicker/lose nodes; dev diagnostics show batching.

#### C2) Entity blocklist / hygiene (⏳ Not implemented)

- **Goal:** keep tool names/internal tokens out of Content KG while preserving real homonyms.
- **Acceptance:** tool entities don’t appear in KG UI; legitimate concepts still do.

#### C3) Merged query modes (routing | content | both) (⏳ Not implemented)

- **Goal:** query-mode parity; UI selector persists preference.
- **Acceptance:** mode switch visibly changes graph and is stable.

#### C4) Context‑action effectiveness rollups (⏳ Not implemented)

- **Goal:** aggregated effectiveness summaries over time.
- **Acceptance:** UI shows effectiveness metrics that evolve with new tool outcomes.

#### C5) O(m) entity retrieval optimization + problem→solution tracking (⏳ Not implemented)

- **Goal:** performance parity for entity merges and cached “known solutions”.
- **Acceptance:** measurably faster for large graphs; regression tests prevent reintroducing O(n\*m).

### D) Regression / Observability

#### D1) Regression test: graph endpoint avoids per-node relationship DB calls (⏳ Not implemented)

- **Goal:** guard against N+1 regressions.

#### D2) Dev-visible timings for graph build and retrieval stages (🟨 Partial)

- **Goal:** surface build/search stage timings in a dev panel.

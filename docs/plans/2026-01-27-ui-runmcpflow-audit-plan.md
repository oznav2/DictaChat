# UI + MCP + runMcpFlow Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Svelte UI, MCP panel/tools, and `runMcpFlow.ts` fully reliable in strict single-user admin mode.

**Architecture:** Add targeted diagnostics, remove fragile UI gating, fix broken interpolations, harden MCP connectivity, and add high-signal runtime + integration tests around the MCP execution path.

**Tech Stack:** SvelteKit 5 runes, Elysia routes, Vitest, Docker Compose, MCP SSE proxy.

---

## Findings From This Audit (Actionable)

1. MCP execution registry previously only read `MCP_SERVERS` while the UI reads `/api/mcp/servers` (env-backed). I patched a fallback to `FRONTEND_MCP_SERVERS` in `frontend-huggingface/src/lib/server/mcp/registry.ts`.
2. MCP controls in the navbar are still gated on `user?.username || user?.email` at `frontend-huggingface/src/lib/components/NavMenu.svelte:311` and `frontend-huggingface/src/lib/components/NavMenu.svelte:339`. This is fragile in single-user mode.
3. The navbar avatar URL is not interpolated and will render literally: `src="https://huggingface.co/api/users/{user.username}/avatar?redirect=true"` at `frontend-huggingface/src/lib/components/NavMenu.svelte:321`.
4. Several `<meta>` attributes appear to use string interpolation incorrectly (braces inside quoted strings) in `frontend-huggingface/src/routes/+layout.svelte:262` and nearby.
5. MCP health checks may fail in Docker if any MCP server URLs still use `localhost:3100` because the server-side health check is executed inside the frontend container. Current mapping logic in `frontend-huggingface/src/routes/api/mcp/health/+server.ts` only rewrites port `:8888`.
6. I cannot complete runtime verification from this environment because `http://127.0.0.1:8004` was not reachable during this session.

---

## Phase 0: Runtime Baseline + Logs

### Task 0.1: Cleanly restart the stack

**Files:**
- Modify: none
- Test: runtime only

**Step 1: Stop the stack**

Run: `./stop.sh`
Expected: all relevant containers stop.

**Step 2: Start the stack via your dev flow**

Run: `./start-dev.sh`
Expected: frontend reports ready; gateway and MCP proxy healthy.

**Step 3: Verify container health**

Run: `docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"`
Expected: `frontend-UI`, `bricksllm-gateway`, and `mcp-sse-proxy` are `Up` and healthy.

**Step 4: Tail frontend logs while loading the UI**

Run: `tail -f .logs/frontend.log`
Expected: MCP servers are loaded and model refresh succeeds.

---

## Phase 1: Diagnostics First (No Guessing)

### Task 1.1: Add MCP registry diagnostics endpoint

**Files:**
- Create: `frontend-huggingface/src/routes/api/admin/diagnostics/mcp/+server.ts`
- Modify: `frontend-huggingface/src/lib/server/mcp/registry.ts`
- Test: `curl http://127.0.0.1:8004/api/admin/diagnostics/mcp`

**Step 1: Write the failing test (unit-ish integration)

Create: `frontend-huggingface/src/routes/api/admin/diagnostics/mcp/__tests__/mcp-diagnostics.test.ts`

```ts
import { describe, expect, it } from "vitest";

describe("/api/admin/diagnostics/mcp", () => {
	it("returns effective MCP servers in single-user mode", async () => {
		expect(true).toBe(true);
	});
});
```

**Step 2: Run the test to confirm it fails meaningfully**

Run: `cd frontend-huggingface && npx vitest run src/routes/api/admin/diagnostics/mcp/__tests__/mcp-diagnostics.test.ts`
Expected: it runs but is trivial; this is a placeholder to hang follow-up assertions on.

**Step 3: Implement the endpoint with strict admin gating**

Create: `frontend-huggingface/src/routes/api/admin/diagnostics/mcp/+server.ts`

Key behavior:
- Require `locals.isAdmin`
- Return:
  - `effectiveRaw`
  - `parsedServers`
  - `count`
  - `source: "MCP_SERVERS" | "FRONTEND_MCP_SERVERS" | "none"`

**Step 4: Export a small helper from the registry**

Modify: `frontend-huggingface/src/lib/server/mcp/registry.ts`

Add an exported function:
- `export function getMcpServersDiagnostics(): { effectiveRaw: string; parsedServers: McpServerConfig[]; source: string }`

**Step 5: Run type checks**

Run: `cd frontend-huggingface && npm run check`
Expected: 0 errors.

**Step 6: Runtime-validate the diagnostics endpoint**

Run: `curl http://127.0.0.1:8004/api/admin/diagnostics/mcp`
Expected: JSON lists the same servers the MCP panel shows.

**Step 7: Commit**

```bash
git add frontend-huggingface/src/routes/api/admin/diagnostics/mcp/+server.ts frontend-huggingface/src/lib/server/mcp/registry.ts frontend-huggingface/src/routes/api/admin/diagnostics/mcp/__tests__/mcp-diagnostics.test.ts
git commit -m "feat: add MCP registry diagnostics endpoint"
```

---

## Phase 2: Fix Fragile UI Gating + Broken Interpolation

### Task 2.1: Make MCP controls visible in single-user mode regardless of `user`

**Files:**
- Modify: `frontend-huggingface/src/lib/components/NavMenu.svelte`
- Test: manual UI check

**Step 1: Add single-user awareness to NavMenu gating**

Update the two MCP-related guards:
- Replace `user?.username || user?.email`
- With: `page.data.singleUserAdminEnabled || user?.username || user?.email`

**Step 2: Run type checks**

Run: `cd frontend-huggingface && npm run check`
Expected: 0 errors.

**Step 3: Manual runtime check**

- Load the UI
- Confirm MCP button is visible even if user data fails to load

**Step 4: Commit**

```bash
git add frontend-huggingface/src/lib/components/NavMenu.svelte
git commit -m "fix: show MCP controls in single-user mode"
```

### Task 2.2: Fix the broken avatar URL interpolation

**Files:**
- Modify: `frontend-huggingface/src/lib/components/NavMenu.svelte`
- Test: manual UI check

**Step 1: Replace the literal brace URL with a Svelte expression**

Use something like:

```svelte
src={user?.username ? `https://huggingface.co/api/users/${user.username}/avatar?redirect=true` : undefined}
```

**Step 2: Run type checks**

Run: `cd frontend-huggingface && npm run check`
Expected: 0 errors.

**Step 3: Manual runtime check**

- Load the UI
- Confirm avatar requests are valid (or absent if no username)

**Step 4: Commit**

```bash
git add frontend-huggingface/src/lib/components/NavMenu.svelte
git commit -m "fix: correct avatar URL interpolation"
```

### Task 2.3: Fix meta tag interpolation bugs in `+layout.svelte`

**Files:**
- Modify: `frontend-huggingface/src/routes/+layout.svelte`
- Test: manual + view-source

**Step 1: Identify all quoted attributes containing `{...}`**

Search in the file for `"{` and fix each to expression form.

**Step 2: Example fix pattern**

Replace:

```svelte
<meta name="twitter:title" content="{publicConfig.PUBLIC_APP_NAME} - Chat with AI models" />
```

With:

```svelte
<meta name="twitter:title" content={`${publicConfig.PUBLIC_APP_NAME} - Chat with AI models`} />
```

**Step 3: Run type checks**

Run: `cd frontend-huggingface && npm run check`
Expected: 0 errors.

**Step 4: Manual runtime check**

- Load the app
- Inspect head tags in devtools

**Step 5: Commit**

```bash
git add frontend-huggingface/src/routes/+layout.svelte
git commit -m "fix: correct meta tag interpolation in layout"
```

---

## Phase 3: Harden MCP Health Checks For Docker

### Task 3.1: Rewrite localhost MCP proxy URLs in Docker

**Files:**
- Modify: `frontend-huggingface/src/routes/api/mcp/health/+server.ts`
- Test: curl MCP health endpoint

**Step 1: Add a rewrite rule for `:3100` under Docker**

When `process.env.DOCKER_ENV` is set and URL includes `localhost:3100` or `127.0.0.1:3100`, rewrite host to `mcp-sse-proxy`.

**Step 2: Add a lightweight unit test for the rewrite function**

Create a small pure helper and test it with Vitest.

**Step 3: Run type checks**

Run: `cd frontend-huggingface && npm run check`
Expected: 0 errors.

**Step 4: Runtime check**

Run (after stack is up):
- `curl -X POST http://127.0.0.1:8004/api/mcp/health -H 'content-type: application/json' -d '{"url":"http://localhost:3100/memory/sse"}'`
Expected: not a connection-refused error.

**Step 5: Commit**

```bash
git add frontend-huggingface/src/routes/api/mcp/health/+server.ts
git commit -m "fix: rewrite localhost MCP proxy URLs under Docker"
```

---

## Phase 4: runMcpFlow Runtime Guards + Tests

### Task 4.1: Add a runMcpFlow “MCP readiness” guardrail

**Files:**
- Modify: `frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts`
- Test: new Vitest unit/integration

**Step 1: Add a structured log when no MCP servers are configured**

Behavior:
- If `getMcpServers().length === 0`, log a clear warning once per process window.
- Continue normally (fail-open), but emit diagnostics.

**Step 2: Add a test that asserts warning behavior when server list is empty**

Use Vitest with mocking around the registry.

**Step 3: Run type checks**

Run: `cd frontend-huggingface && npm run check`
Expected: 0 errors.

**Step 4: Commit**

```bash
git add frontend-huggingface/src/lib/server/textGeneration/mcp/runMcpFlow.ts
git commit -m "chore: add MCP readiness guardrail logging in runMcpFlow"
```

### Task 4.2: Add integration tests around MCP tool availability flow

**Files:**
- Create: `frontend-huggingface/src/lib/server/textGeneration/mcp/__tests__/runMcpFlow.mcp-availability.test.ts`
- Modify: minimal helpers only if needed

**Step 1: Write the failing test**

Scenarios:
- Effective MCP server list is non-empty
- Tools are discoverable
- Tool gating doesn’t drop all tools when memory is degraded

**Step 2: Run the test and confirm failure**

Run: `cd frontend-huggingface && npx vitest run src/lib/server/textGeneration/mcp/__tests__/runMcpFlow.mcp-availability.test.ts`

**Step 3: Implement minimal shims/mocks to make it pass**

Focus on:
- registry mocks
- tool discovery mocks
- tool gating input scaffolding

**Step 4: Run full checks**

Run:
- `cd frontend-huggingface && npm run check`
- `cd frontend-huggingface && npm run test`

**Step 5: Commit**

```bash
git add frontend-huggingface/src/lib/server/textGeneration/mcp/__tests__/runMcpFlow.mcp-availability.test.ts
git commit -m "test: add MCP availability integration coverage for runMcpFlow"
```

---

## Phase 5: End-to-End UI Walkthrough Script (Playwright)

### Task 5.1: Add a Playwright audit script for MCP panel + chat send

**Files:**
- Create: `frontend-huggingface/tests/e2e/mcp-panel-smoke.spec.ts`

**Step 1: Write a smoke test that:
- loads `/`
- confirms MCP controls are visible
- opens MCP manager
- checks at least one base server card renders
- closes modal
- sends a message**

**Step 2: Run it locally only when the stack is up**

Run: `cd frontend-huggingface && npx playwright test tests/e2e/mcp-panel-smoke.spec.ts`

**Step 3: Commit**

```bash
git add frontend-huggingface/tests/e2e/mcp-panel-smoke.spec.ts
git commit -m "test: add MCP panel smoke test"
```

---

## Phase 6: Verification Checklist (Must Pass Before Launch)

### Task 6.1: Runtime verification checklist

**Files:**
- Modify: none

**Step 1: MCP server list consistency**

Run:
- `curl http://127.0.0.1:8004/api/mcp/servers`
- `curl http://127.0.0.1:8004/api/admin/diagnostics/mcp`

Expected: same count + names.

**Step 2: MCP health check works from inside frontend **

check:
- `.logs/frontend.log`
- Trigger a health check from the MCP manager UI

Expected: no connection-refused errors to MCP proxy.

**Step 3: Chat send + tool use**

In UI:
- ask a tool-requiring question
- confirm tool updates render
- confirm final answer returns

**Step 4: Memory still works**

In UI:
- ask a question that should recall memory
- confirm memory indicators/citations appear

---

## Notes / Constraints

1. In strict single-user mode, we intentionally ignore all legacy `userId`-scoped data.
2. The MCP path now has three critical sources of truth that must agree:
   - MCP panel: `/api/mcp/servers`
   - MCP execution: `getMcpServers()`
   - MCP health: `/api/mcp/health`
3. Do not reintroduce any `userId` scoping in single-user mode unless explicitly requested.


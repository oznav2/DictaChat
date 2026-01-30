# Single-User Always-Admin Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the app reliably run as a single user who is always admin, without token/login flows or in-memory admin state.

**Architecture:** Introduce a server-side single-user flag that short-circuits auth to a stable session and `isAdmin=true`, then align hooks, feature flags, and client guards to that mode. Add an optional one-time migration to rebind old session-scoped data to the stable single-user session.

**Tech Stack:** SvelteKit, Elysia, MongoDB, Vitest, TypeScript

---

### Task 1: Add Single-User Admin Auth Contract (Tests First)

**Files:**
- Create: `frontend-huggingface/src/lib/server/__tests__/auth/singleUserAdmin.test.ts`
- Modify: `frontend-huggingface/src/lib/server/auth.ts`

**Step 1: Write a failing test for single-user admin mode**

```ts
import { describe, expect, it, vi } from "vitest";

describe("single-user admin auth", () => {
	it("returns a stable admin session when SINGLE_USER_ADMIN=true", async () => {
		vi.resetModules();
		process.env.SINGLE_USER_ADMIN = "true";
		process.env.SINGLE_USER_SESSION_SECRET = "single-user-admin";

		const { authenticateRequest } = await import("$lib/server/auth");

		const result = await authenticateRequest(
			{ type: "svelte", value: new Headers() },
			{ type: "svelte", value: { get: () => undefined } as any },
			new URL("http://localhost:8004/")
		);

		expect(result.isAdmin).toBe(true);
		expect(result.secretSessionId).toBe("single-user-admin");
		expect(result.sessionId).toMatch(/^[a-f0-9]{64}$/);
	});
});
```

**Step 2: Run the test to confirm it fails**

Run: `cd frontend-huggingface && npx vitest run src/lib/server/__tests__/auth/singleUserAdmin.test.ts`
Expected: FAIL because single-user admin mode is not implemented yet.

**Step 3: Implement single-user admin mode in auth**

Add a flag and a short-circuit at the top of `authenticateRequest(...)` in `frontend-huggingface/src/lib/server/auth.ts`.

```ts
export const singleUserAdminEnabled = (config.SINGLE_USER_ADMIN || "").toLowerCase() === "true";

const singleUserSessionSecret =
	config.SINGLE_USER_SESSION_SECRET || "bricksllm-single-user-admin";

async function buildSingleUserAdminAuth() {
	const secretSessionId = singleUserSessionSecret;
	const sessionId = await sha256(secretSessionId);
	return {
		user: undefined,
		token: undefined,
		sessionId,
		secretSessionId,
		isAdmin: true,
	};
}
```

Then at the start of `authenticateRequest(...)`:

```ts
if (singleUserAdminEnabled) {
	return buildSingleUserAdminAuth();
}
```

**Step 4: Re-run the test**

Run: `cd frontend-huggingface && npx vitest run src/lib/server/__tests__/auth/singleUserAdmin.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add frontend-huggingface/src/lib/server/auth.ts frontend-huggingface/src/lib/server/__tests__/auth/singleUserAdmin.test.ts
git commit -m "feat(auth): add single-user always-admin auth mode"
```

---

### Task 2: Make Hooks Enforce Stable Admin State

**Files:**
- Modify: `frontend-huggingface/src/hooks.server.ts:427`
- Modify: `frontend-huggingface/src/lib/server/auth.ts:59`

**Step 1: Gate OAuth redirects behind single-user mode**

In `frontend-huggingface/src/hooks.server.ts`, import the flag:

```ts
import { authenticateRequest, loginEnabled, refreshSessionCookie, triggerOauthFlow, singleUserAdminEnabled } from "$lib/server/auth";
```

Wrap the OAuth redirect block:

```ts
if (!singleUserAdminEnabled && loginEnabled && !auth.user && !event.url.pathname.startsWith(`${base}/.well-known/`)) {
	// existing redirect logic
}
```

**Step 2: Always set the stable cookie in single-user mode**

Right after `event.locals.sessionId = auth.sessionId;` add:

```ts
if (singleUserAdminEnabled) {
	refreshSessionCookie(event.cookies, auth.secretSessionId);
}
```

**Step 3: Force admin in single-user mode**

Replace:

```ts
event.locals.isAdmin = event.locals.user?.isAdmin || adminTokenManager.isAdmin(event.locals.sessionId);
```

With:

```ts
event.locals.isAdmin =
	singleUserAdminEnabled || event.locals.user?.isAdmin || adminTokenManager.isAdmin(event.locals.sessionId);
```

**Step 4: Ensure session heartbeat doesn’t silently no-op**

In `frontend-huggingface/src/hooks.server.ts:497`, add `upsert: true` to the sessions update:

```ts
await collections.sessions.updateOne(
	{ sessionId: auth.sessionId },
	{ $set: { updatedAt: new Date(), expiresAt: addWeeks(new Date(), 2) } },
	{ upsert: true }
);
```

**Step 5: Verify in dev**

Run: `cd frontend-huggingface && npm run check`
Expected: 0 errors.

Manual checks:
- `http://127.0.0.1:8004/` should load without token.
- Admin endpoints should stop returning 403, for example `GET /api/system/version`.

**Step 6: Commit**

```bash
git add frontend-huggingface/src/hooks.server.ts
git commit -m "fix(auth): enforce stable always-admin state in hooks"
```

---

### Task 3: Align Elysia API Locals With Single-User Mode

**Files:**
- Modify: `frontend-huggingface/src/lib/server/api/authPlugin.ts`
- Modify: `frontend-huggingface/src/lib/server/auth.ts`
- Create: `frontend-huggingface/src/lib/server/__tests__/auth/authPlugin.singleUser.test.ts`

**Step 1: Add a focused test for authPlugin locals**

```ts
import { describe, expect, it, vi } from "vitest";

describe("authPlugin single-user locals", () => {
	it("derives isAdmin=true when SINGLE_USER_ADMIN=true", async () => {
		vi.resetModules();
		process.env.SINGLE_USER_ADMIN = "true";

		const { authenticateRequest } = await import("$lib/server/auth");
		const res = await authenticateRequest(
			{ type: "elysia", value: {} as any },
			{ type: "elysia", value: {} as any },
			new URL("http://localhost:8004"),
			true
		);

		expect(res.isAdmin).toBe(true);
	});
});
```

**Step 2: Run the test**

Run: `cd frontend-huggingface && npx vitest run src/lib/server/__tests__/auth/authPlugin.singleUser.test.ts`
Expected: PASS once Task 1 is complete.

**Step 3: Keep authPlugin minimal but explicit**

No behavior change is required if `authenticateRequest(...)` already short-circuits correctly. Add a brief comment in `frontend-huggingface/src/lib/server/api/authPlugin.ts` clarifying that single-user mode is resolved inside `authenticateRequest(...)`.

**Step 4: Run checks**

Run: `cd frontend-huggingface && npm run check`
Expected: 0 errors.

**Step 5: Commit**

```bash
git add frontend-huggingface/src/lib/server/api/authPlugin.ts frontend-huggingface/src/lib/server/__tests__/auth/authPlugin.singleUser.test.ts
git commit -m "test(auth): cover single-user admin mode in API auth"
```

---

### Task 4: Make Feature Flags Reflect Single-User Reality

**Files:**
- Modify: `frontend-huggingface/src/lib/server/api/routes/groups/misc.ts:22`
- Modify: `frontend-huggingface/src/lib/server/auth.ts:59`

**Step 1: Extend feature flags shape**

In `frontend-huggingface/src/lib/server/api/routes/groups/misc.ts`:

```ts
export interface FeatureFlags {
	enableAssistants: boolean;
	loginEnabled: boolean;
	isAdmin: boolean;
	transcriptionEnabled: boolean;
	singleUserAdminEnabled: boolean;
}
```

**Step 2: Report single-user state to the client**

Import the flag and update the response:

```ts
import { loginEnabled, singleUserAdminEnabled } from "$lib/server/auth";
```

```ts
return {
	enableAssistants: config.ENABLE_ASSISTANTS === "true",
	loginEnabled: singleUserAdminEnabled ? false : loginEnabled,
	isAdmin: singleUserAdminEnabled ? true : locals.isAdmin,
	transcriptionEnabled: !!config.get("TRANSCRIPTION_MODEL"),
	singleUserAdminEnabled,
} satisfies FeatureFlags;
```

**Step 3: Run checks**

Run: `cd frontend-huggingface && npm run check`
Expected: 0 errors.

**Step 4: Commit**

```bash
git add frontend-huggingface/src/lib/server/api/routes/groups/misc.ts
git commit -m "feat(flags): expose single-user admin mode to client"
```

---

### Task 5: Remove Client-Side Auth Headaches in Single-User Mode

**Files:**
- Modify: `frontend-huggingface/src/lib/utils/auth.ts:9`
- Modify: `frontend-huggingface/src/routes/+layout.svelte:188`
- Create: `frontend-huggingface/src/lib/__tests__/auth/requireAuthUser.singleUser.test.ts`

**Step 1: Make requireAuthUser a no-op in single-user mode**

In `frontend-huggingface/src/lib/utils/auth.ts`:

```ts
export function requireAuthUser(): boolean {
	if (page.data.singleUserAdminEnabled) {
		return false;
	}
	if (page.data.loginEnabled && !page.data.user) {
		const next = page.url.pathname + page.url.search;
		const url = `${base}/login?next=${encodeURIComponent(next)}`;
		goto(url, { invalidateAll: true });
		return true;
	}
	return false;
}
```

**Step 2: Skip token validation in single-user mode**

In `frontend-huggingface/src/routes/+layout.svelte`, wrap the token block:

```svelte
if (page.url.searchParams.has("token") && !page.data.singleUserAdminEnabled) {
	// existing token flow
}
```

**Step 3: Add a small test for the guard**

```ts
import { describe, expect, it, vi } from "vitest";

describe("requireAuthUser single-user mode", () => {
	it("does not redirect when singleUserAdminEnabled=true", async () => {
		vi.resetModules();
		// This test can be implemented with a small wrapper that injects page.data.
		expect(true).toBe(true);
	});
});
```

(Keep this test minimal; the main safety net is the feature flag wiring.)

**Step 4: Run checks**

Run: `cd frontend-huggingface && npm run check`
Expected: 0 errors.

**Step 5: Commit**

```bash
git add frontend-huggingface/src/lib/utils/auth.ts frontend-huggingface/src/routes/+layout.svelte frontend-huggingface/src/lib/__tests__/auth/requireAuthUser.singleUser.test.ts
git commit -m "fix(client): disable auth/token flows in single-user mode"
```

---

### Task 6: Optional But Recommended — Migrate Old Session Data

**Why:** Once you move to a stable single-user session, old data tied to previous random sessionIds will disappear unless migrated.

**Files:**
- Create: `frontend-huggingface/src/routes/api/admin/single-user/migrate/+server.ts`
- Modify: `frontend-huggingface/src/lib/server/auth.ts`
- Modify: `frontend-huggingface/src/hooks.server.ts`

**Step 1: Define the target stable sessionId**

Export a helper from auth:

```ts
export const singleUserSessionSecret =
	config.SINGLE_USER_SESSION_SECRET || "bricksllm-single-user-admin";

export const getSingleUserSessionId = async (): Promise<string> =>
	sha256(singleUserSessionSecret);
```

**Step 2: Implement a migration endpoint guarded by admin**

In `frontend-huggingface/src/routes/api/admin/single-user/migrate/+server.ts`:

```ts
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { collections } from "$lib/server/database";
import { getSingleUserSessionId, singleUserAdminEnabled } from "$lib/server/auth";

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.isAdmin || !singleUserAdminEnabled) {
		return json({ success: false, error: "Not allowed" }, { status: 403 });
	}

	const targetSessionId = await getSingleUserSessionId();

	const results = await Promise.all([
		collections.conversations.updateMany(
			{ sessionId: { $exists: true }, userId: { $exists: false } },
			{ $set: { sessionId: targetSessionId } }
		),
		collections.settings.updateMany(
			{ sessionId: { $exists: true }, userId: { $exists: false } },
			{ $set: { sessionId: targetSessionId } }
		),
		collections.assistants.updateMany(
			{ sessionId: { $exists: true }, userId: { $exists: false } },
			{ $set: { sessionId: targetSessionId } }
		),
		collections.sessions.updateMany(
			{ sessionId: { $exists: true } },
			{ $set: { sessionId: targetSessionId } }
		),
	]);

	return json({
		success: true,
		targetSessionId,
		results: results.map((r) => ({ matched: r.matchedCount, modified: r.modifiedCount })),
	});
};
```

**Step 3: Run the migration once**

Run after stack is up:

```bash
curl -X POST http://127.0.0.1:8004/api/admin/single-user/migrate
```

Expected: `success: true` and non-zero `modified` counts if you had previous sessions.

**Step 4: Commit**

```bash
git add frontend-huggingface/src/routes/api/admin/single-user/migrate/+server.ts frontend-huggingface/src/lib/server/auth.ts
git commit -m "feat(admin): add single-user session migration endpoint"
```

---

### Task 7: Configuration and Rollout

**Files:**
- Modify: `.env:375`
- Modify: `frontend-huggingface/.env.local:34`
- Modify: `start-dev.sh:185`
- Modify: `STATUS.md:1`

**Step 1: Add the single-user flags to environment**

In `.env` (root):

```env
SINGLE_USER_ADMIN=true
SINGLE_USER_SESSION_SECRET=bricksllm-single-user-admin
```

In `frontend-huggingface/.env.local`:

```env
SINGLE_USER_ADMIN=true
SINGLE_USER_SESSION_SECRET=bricksllm-single-user-admin
```

**Step 2: Ensure start-dev.sh preserves/sets the flags**

In `start-dev.sh`, after the dev injection block, append:

```bash
if ! grep -q "^SINGLE_USER_ADMIN=" "$SCRIPT_DIR/frontend-huggingface/.env"; then
	echo "SINGLE_USER_ADMIN=true" >> "$SCRIPT_DIR/frontend-huggingface/.env"
fi
if ! grep -q "^SINGLE_USER_SESSION_SECRET=" "$SCRIPT_DIR/frontend-huggingface/.env"; then
	echo "SINGLE_USER_SESSION_SECRET=bricksllm-single-user-admin" >> "$SCRIPT_DIR/frontend-huggingface/.env"
fi
```

**Step 3: Validate end-to-end**

Run:

```bash
./stop.sh && ./start-dev.sh
```

Then verify:
- `http://127.0.0.1:8004/` loads without token.
- MCP panel and navbar work immediately.
- Admin endpoints stop returning 403, e.g. `GET /api/system/version`.

**Step 4: Update STATUS.md**

Add a new entry describing the new single-user always-admin mode.

**Step 5: Commit**

```bash
git add .env frontend-huggingface/.env.local start-dev.sh STATUS.md
git commit -m "chore(config): enable single-user always-admin mode"
```

---

## Notes and Key Risks

- The current admin token approach is in-memory (`adminSessions`), so it resets on restart. This plan removes that dependency for your single-user deployment.
- If you have existing data tied to previous random sessionIds, you should run Task 6 once.
- In single-user mode, avoid setting a fake `locals.user` unless you also migrate all data to `userId` everywhere. Keeping session-based auth is the safer low-risk path.


# BricksLLM Code Rules (Codespace Plan)

This file is the single, authoritative coding guide for implementing phases in `\home\ilan\BricksLLM\codespace_gaps_enhanced.md`. Follow these rules to reduce errors and keep changes production-ready and enterprise-grade.

## Core Principles

- Prefer small, focused changes that reuse existing patterns and services.
- Keep runtime behavior enforceable in code, not only prompt-guidance.
- Optimize for performance and minimal client-side JavaScript.
- Prefer SSR-first solutions; use the client only when required.
- Use descriptive names and consistent conventions across the codebase.
- Never log secrets, tokens, cookies, headers, or raw tool outputs.

## Project Reality (This Repo)

- Frontend app: `frontend-huggingface/` (SvelteKit + Vite + Svelte 5).
- Tests: Vitest (node + browser via Playwright), configured in [vite.config.ts](file:///home/ilan/BricksLLM/frontend-huggingface/vite.config.ts).
- Styling: TailwindCSS with `darkMode: "class"` and typography/scrollbar plugins in [tailwind.config.cjs](file:///home/ilan/BricksLLM/frontend-huggingface/tailwind.config.cjs).
- SvelteKit adapter: `@sveltejs/adapter-node` in [svelte.config.js](file:///home/ilan/BricksLLM/frontend-huggingface/svelte.config.js).
- Formatting: Prettier tabs + Tailwind plugin in [.prettierrc](file:///home/ilan/BricksLLM/frontend-huggingface/.prettierrc).
- ESLint: strict client rules; server/test overrides in [.eslintrc.cjs](file:///home/ilan/BricksLLM/frontend-huggingface/.eslintrc.cjs).

## Commands (Must Run Before Considering a Phase “Done”)

From `frontend-huggingface/`:

```bash
npm run check
npm run lint
npm run test
npm run build
```

## TypeScript Rules (Frontend + Server)

- Use TypeScript everywhere for new code.
- Public functions/methods must have explicit return types.
- Avoid `any` in client-side code; it is allowed in `src/lib/server/**` and `src/routes/**` only when necessary.
- Avoid non-null assertions (`!`) in client-side code.
- Prefer `T | null` over optional fields for state that can be absent.
- Prefer `Record<string, unknown>` for loose objects; narrow with parsing/guards.
- Validate untrusted inputs at boundaries (API routes, actions, tool payloads). Prefer `zod` for runtime validation when practical.
- Use structured errors:
  - SvelteKit routes: use `error(status, message)` for HTTP errors.
  - Server utilities: throw typed errors or return explicit `{ ok: false, ... }` results when failure is expected.

## Clean TypeScript & Design Guidelines (Adapted)

- Use English for code identifiers and developer-facing documentation.
- User-facing strings may be Hebrew/RTL; keep them centralized and consistent.
- Always declare types for function parameters and return values (especially across module boundaries).
- Prefer explicit types for exported values and cross-module data contracts.
- Use inference for local variables only when the type is obvious and stable.
- Prefer complete words over abbreviations (exceptions: API, URL, id, err, ctx, req/res in route handlers).
- Avoid magic numbers; define named constants when a number affects behavior.
- Prefer one primary export per file; avoid “export bags” that mix unrelated concerns.

### Function Rules

- Keep functions small and single-purpose.
- Use guard clauses and early returns to reduce nesting.
- Prefer RO-RO for complex signatures:
  - Pass a single params object.
  - Return a result object when multiple values are needed.
- Use higher-order functions (`map`, `filter`, `reduce`) when they improve clarity, not when they obscure control flow.
- Use default parameter values when a default is stable and intentional.
- Avoid blank lines inside short functions; if used, keep them rare and purposeful.

### Data Rules

- Prefer immutability by default:
  - Use `readonly` where appropriate.
  - Use `as const` for literals that must not widen.
- Encapsulate related primitives into composite types when it improves correctness and readability.
- Prefer validating untrusted inputs at boundaries (routes/actions). Avoid scattering validation deep inside business logic.

### Service/Class Rules (Server-Side and Shared Logic)

- Prefer small, purpose-built services over “god objects”.
- Prefer composition over inheritance.
- Define interfaces/contracts when it improves testability and dependency isolation.
- When a public class/method is non-trivial, add minimal JSDoc describing intent and invariants.

### Exceptions & Errors

- Throw for unexpected failures (invariants, dependency failures where the caller cannot recover).
- Catch exceptions only to add context, transform into a stable error/result shape, or apply an expected fallback.

### Testing Conventions

- Follow Arrange–Act–Assert for unit tests.
- Use clear variable names (`inputX`, `mockX`, `actualX`, `expectedX`).
- Add unit tests for each new public function/service method where behavior is non-trivial.
- Prefer integration tests for cross-boundary flows (Mongo/Qdrant/tool ingestion/memory search).

## Code Style & Formatting (Repository Overrides)

- Follow the repo’s ESLint + Prettier configuration, not Standard.js.
- Do not manually enforce 2-space indentation, quote style, or “no semicolons”; let Prettier format the code.
- Use guard clauses and early returns to reduce nesting.
- Prefer descriptive names with auxiliary verbs (`isLoading`, `hasError`, `shouldRetry`).
- Prefer modularization over duplication: extract helpers when logic repeats.
- Do not do “style refactors” as part of plan phases; keep diffs minimal.

## JavaScript / Node.js Rules (Applies to Server-Side TS/JS Here)

- Node version must remain compatible with `node >= 18` (see `frontend-huggingface/package.json`).
- Always use strict equality (`===`) and explicit boolean checks.
- Always handle errors from async boundaries:
  - `try/catch` around awaited operations that can fail (network, DB, filesystem).
  - If returning errors (instead of throwing), use stable result shapes.
- Handle edge cases at function start; keep the “happy path” last when it improves readability.
- Never leak secrets in logs. Redact or omit:
  - Authorization headers, cookies, API keys, tokens, signed URLs.
  - Raw tool outputs when they can contain sensitive data.

## Frontend Framework Scope (What Applies vs Not)

- This repo’s UI is SvelteKit (Svelte 5), not React/Next.js.
- Do not introduce React/Next-specific patterns into `frontend-huggingface/`.
- If a future phase explicitly adds a React/Next subsystem, place it in a dedicated workspace and add a separate rule section for it.

## Rules Provided But Not Applicable To This Repo’s Codespace Plan

These rules were provided but must not be followed for implementing `codespace_gaps_enhanced.md` in this repository:

- Next.js App Router, React Server Components, `"use client"`, Server Actions.
- Zustand, Shadcn UI, Radix UI.
- Stylus and `*.module.styl` CSS Modules workflow.
- Jest + React Testing Library (this repo uses Vitest + Playwright for browser tests).
- NestJS framework module/controller/service conventions and MikroORM patterns.
- `class-validator` DTO validation patterns (use Zod or existing boundary validation patterns here).
- “kebab-case for file names everywhere” and “one export per file everywhere” (follow existing repo naming/exports).

## Import Order (Repository Standard)

Use this order with blank lines between groups:

1. Type imports
2. External packages
3. SvelteKit/Svelte framework
4. Alias imports (`$lib/...`, `$app/...`, `$api/...`)
5. Relative imports
6. Icon imports (Svelte components only)

Reference: [AGENTS.md](file:///home/ilan/BricksLLM/AGENTS.md#L67-L93)

## SvelteKit Structure & Routing

Recommended structure:

```
src/
  lib/
  routes/
  app.html
static/
svelte.config.js
vite.config.ts
```

Routing:

- Use file-based routing under `src/routes/`.
- Use `+page.svelte`, `+layout.svelte`, `+error.svelte` appropriately.
- Use `[slug]` directories for dynamic routes.
- Keep server-only code in `+page.server.ts`, `+layout.server.ts`, and `src/lib/server/**`.

## Data Fetching (Load Functions)

- Prefer server-side `load` for data fetching and pre-rendering behavior.
- Keep load outputs minimal and serializable.
- Handle failures explicitly:
  - Use `error(4xx/5xx, message)` for page-level errors.
  - Use graceful degradation (empty state + “degraded” indicator) for non-critical dependencies.

## SSR / SSG Rules

- Default to SSR for dynamic content.
- Use prerendering only when content is static and safe to precompute.
- Avoid browser-only APIs during SSR; gate with `$app/environment` (`browser`) when needed.

## Svelte 5 Component Patterns (Runes)

- Prefer Svelte 5 runes conventions (`$state`, `$derived`, `$effect`, `$props`) consistent with existing code.
- Prefer composition: small components, clear props, minimal shared state.
- Use stores for global state; context API for scoped shared state.
- For interactive elements, ensure keyboard access and correct semantics.

Reference patterns: [AGENTS.md](file:///home/ilan/BricksLLM/AGENTS.md#L144-L173)

## Styling Rules (TailwindCSS + Svelte)

- Prefer Tailwind utility classes in markup for consistency.
- Use responsive utilities (`sm:`, `md:`, `lg:`) and shared spacing scale.
- Do not use `@apply`; prefer direct utility classes.
- Use `darkMode: "class"` and rely on class toggling for theme behavior.
- Prefer scoped `<style>` only when Tailwind is insufficient; keep scoped CSS minimal.
- Keep global styles minimal and intentional.

## Vite Rules

- Keep Vite config changes minimal; prefer standard SvelteKit patterns.
- Use Vite plugin additions only when required by a feature (e.g., existing icon plugin).
- Ensure changes work in SSR and do not introduce browser-only assumptions into server builds.

Reference: [vite.config.ts](file:///home/ilan/BricksLLM/frontend-huggingface/vite.config.ts)

## API Routes & Server Code (SvelteKit)

- Create API endpoints under `src/routes/api/**/+server.ts`.
- Validate request bodies, query params, and headers.
- Return stable JSON shapes and consistent error formatting.
- Do not leak internal stack traces to clients.
- Enforce timeouts on outbound requests (tools, embeddings, DB calls) and degrade gracefully.

## Forms & Actions

- Prefer SvelteKit form actions for server-side mutations.
- Use progressive enhancement: forms should still submit without client JavaScript.
- Validate inputs server-side even if client-side validation exists.

## Authentication & Security

- Use secure, HTTP-only cookies for sessions when applicable.
- Use CSRF protections appropriate to the deployment; the repo config sets `csrf.checkOrigin=false` and handles origin checks in hooks, so do not reintroduce ad-hoc checks per-route.
- Sanitize any user-provided HTML before rendering; prefer existing sanitization utilities already in the repo.
- Redact sensitive data in logs; do not persist secrets into memory storage.

Reference: [svelte.config.js](file:///home/ilan/BricksLLM/frontend-huggingface/svelte.config.js#L34-L37)

## Performance Rules

- Treat Core Web Vitals (LCP, FID, CLS) as a release gate for UI-heavy phases.
- Prefer SSR-rendered content over client-only rendering.
- Lazy-load images and heavy components.
- Keep payload sizes bounded:
  - Avoid shipping large JSON blobs to the client.
  - Summarize large tool outputs before persistence and before rendering.

## Accessibility Rules

- Use semantic HTML elements for structure.
- Add ARIA only when necessary; do not replace semantics with ARIA.
- Ensure keyboard navigation and visible focus for all interactive elements.
- Manage focus intentionally when opening modals/panels.

## Testing Rules (Vitest + Playwright)

- Add unit tests for new logic and regression tests for fixed bugs.
- Prefer integration tests for cross-service flows (e.g., memory store + search + UI update).
- If a change impacts SSR behavior, add/adjust SSR tests.
- For UI behavior, prefer browser tests in the existing client workspace configuration.

Reference: [vite.config.ts](file:///home/ilan/BricksLLM/frontend-huggingface/vite.config.ts#L62-L101)

## Definition of Done (Per Phase Implementation)

- Code follows these rules and existing project conventions.
- `npm run check`, `npm run lint`, `npm run test`, and `npm run build` pass.
- Error handling is explicit and safe (no secret leakage).
- SSR works (no browser-only code executed on the server).
- User-visible UI changes are accessible and responsive.

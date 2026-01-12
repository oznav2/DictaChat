# index.ts (roampalClient) - Map

## Summary

The `index.ts` file in the `roampalClient` directory serves as a public barrel export. It consolidates the SDK's core class, singleton accessor, and all data schemas/types into a single entry point, simplifying imports for the rest of the application.

---

## Technical Map

### Exports

- **Line 1**: Exports `RoampalClient` and `getRoampalClient` from the main client implementation.
- **Line 2**: Re-exports all Zod schemas from `schemas.ts`.
- **Line 3**: Explicitly re-exports high-level TypeScript types (`Message`, `SendMessageResponse`, etc.) for consumer convenience.

---

## Connection & Dependencies

- **Consumer components**: Any file using the RoamPal SDK can simply import from `@/lib/roampalClient`.

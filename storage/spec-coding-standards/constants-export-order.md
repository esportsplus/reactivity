---
type: refactor
recommended-model: sonnet
status: PENDING
validation: deterministic
depends-on: none
api-impact: none
source: audit finding 7
files-own: [src/constants.ts]
tests: [tests/system.ts, tests/reactive.ts]
---

# Alphabetize the constants export list

## Rationale
src/constants.ts:41 lists `PACKAGE_NAME` after the `REACTIVE_ARRAY, REACTIVE_OBJECT` line in the export block — alphabetical order puts P before R. Export list only; the STATE_* declaration order (bit-value order 1<<0…1<<6) is intentional data order and stays untouched.

## Changes
The barrel export statement only — zero behavior change.

## Design
Prior-design defect: it pinned validation on `pnpm exec tsc` / `pnpm exec vitest` without stating the environment precondition — the engine's ephemeral worktree ships without `node_modules`, so `pnpm exec` fell back to a broken global shim (`MODULE_NOT_FOUND: @esportsplus/typescript/bin/tsc`) and a byte-perfect edit still returned FAIL; the edit itself was never wrong.

Step 1 — environment precondition, run before anything else: `pnpm install --frozen-lockfile` in the worktree root. This is dependency installation only, not a file edit: `node_modules/` is untracked, `--frozen-lockfile` guarantees `pnpm-lock.yaml` is not modified, and the `prepare` hook's `tsc` build writes only the gitignored `build/` directory — `git status --short` stays empty afterward (verified in this worktree; install completes in ~3s).

Step 2 — the edit. The target state is ALREADY COMMITTED at e7558f2 (`refactor(constants): [constants-export-order] alphabetize export block`). If the `export { ... }` block in src/constants.ts (lines 38-45) already matches the block below byte-for-byte, make NO edit and go to step 3. Otherwise set it to exactly:
```ts
export {
    COMPUTED,
    PACKAGE_NAME,
    REACTIVE_ARRAY, REACTIVE_OBJECT,
    SIGNAL,
    STABILIZER_IDLE, STABILIZER_RESCHEDULE, STABILIZER_RUNNING, STABILIZER_SCHEDULED,
    STATE_CHECK, STATE_COMPUTED, STATE_DIRTY, STATE_EFFECT, STATE_ERROR, STATE_IN_HEAP, STATE_NONE, STATE_NOTIFY_MASK, STATE_RECOMPUTING
};
```
No declaration moves; nothing else in the file changes.

Step 3 — validate with the item's Checks exactly as written; after step 1 all three resolve and all three are verified green in this worktree: layout regex PASS, `pnpm exec tsc --noEmit` PASS, `pnpm exec vitest run tests/system.ts tests/reactive.ts` PASS (107/107 tests).

## Acceptance
`tsc --noEmit` green; 0 regressions in tests/system.ts and tests/reactive.ts, run scoped; export block matches the pinned layout.

## Checks
- node -e "const s=require('fs').readFileSync('src/constants.ts','utf8');process.exit(/COMPUTED,\s*\n\s*PACKAGE_NAME,\s*\n\s*REACTIVE_ARRAY, REACTIVE_OBJECT,/.test(s)?0:1)"
- pnpm exec tsc --noEmit
- pnpm exec vitest run tests/system.ts tests/reactive.ts

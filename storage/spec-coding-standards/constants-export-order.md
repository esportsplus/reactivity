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
Exact recipe: in the `export { ... }` block (lines 38-45), move the `PACKAGE_NAME,` line above the `REACTIVE_ARRAY, REACTIVE_OBJECT,` line. Final block:
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

## Acceptance
`tsc --noEmit` green; 0 regressions in tests/system.ts and tests/reactive.ts, run scoped; export block matches the pinned layout.

## Checks
- node -e "const s=require('fs').readFileSync('src/constants.ts','utf8');process.exit(/COMPUTED,\s*\n\s*PACKAGE_NAME,\s*\n\s*REACTIVE_ARRAY, REACTIVE_OBJECT,/.test(s)?0:1)"
- pnpm exec tsc --noEmit
- pnpm exec vitest run tests/system.ts tests/reactive.ts

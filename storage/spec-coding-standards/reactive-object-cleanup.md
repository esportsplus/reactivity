---
type: refactor
recommended-model: opus
status: PENDING
depends-on: none
api-impact: none
source: audit findings 1, 4, 5, 6, 8 (src/reactive/object.ts bundle)
files-own: [src/reactive/object.ts]
tests: [tests/objects.ts, tests/nested.ts, tests/reactive.ts]
---

# ReactiveObject cleanup: any-cast, dead branch, member order, imports

## Rationale
src/reactive/object.ts carries four standards violations in one file: an `any`-typed guard predicate, an empty comment-only `if` block plus its restating comment, non-alphabetical class member order, and unsorted imports. Bundled so `files-own` stays non-overlapping.

## Changes
ReactiveObject construction, guard-predicate narrowing, and disposal keep identical runtime behavior; the file's structure and types are brought to standard.

## Design
Settled decisions, in application order:
1. Imports (finding 6) — single destructured group ordered external → `~/` alias → relative, alphabetical within each (no default imports in this file):
   `'@esportsplus/utilities'`, `'~/constants'`, `'~/system'`, `'~/types'`, `'./array'`.
2. Dead branch + restating comment (findings 4, 8) — replace the empty `if (value == null || type !== 'object') { // Skip isArray when possible }` / `else if (isArray(value)) { ... }` chain (lines 35-45) with ONE positive guard:
   `if (value != null && type === 'object' && isArray(value)) { defineProperty(... REACTIVE_ARRAY branch ...); continue; }`
   This preserves the original short-circuit intent (isArray is only reached for non-null objects) with no empty block and no comment. Equivalence: null/primitive → falls to signal (as before); non-array object → falls to signal (as before); array → reactive array + continue (as before).
3. Member order (finding 5) — private → protected → public, methods alphabetical within visibility: `disposers` field, constructor, then protected `[COMPUTED]`, `[REACTIVE_ARRAY]`, `[SIGNAL]` (alphabetical by symbol name), then public `dispose()` last. Dependency-safe: methods reference each other only at call time.
4. Guard predicate (finding 1) — `isReactiveObject` becomes `(value: unknown): value is ReactiveObject<Record<PropertyKey, unknown>>` with narrowing body:
   `typeof value === 'object' && value !== null && (value as Record<PropertyKey, unknown>)[REACTIVE_OBJECT] === true`.
   Discretion: if the narrowed generic breaks a caller (src/reactive/array.ts `dispose`, tests/reactive.ts), pick the narrowest generic that compiles at every call site; criterion: zero `any`, unchanged runtime behavior, callers keep their existing casts or lose them — never gain new ones.

## Reads
- src/reactive/array.ts — `dispose()` caller of isReactiveObject; ReactiveArray consumed in the constructor
- src/constants.ts — COMPUTED/REACTIVE_ARRAY/REACTIVE_OBJECT/SIGNAL symbols
- tests/reactive.ts — imports isReactiveObject directly; guards the predicate's contract

## Acceptance
`tsc --noEmit` green; 0 regressions in tests/objects.ts, tests/nested.ts, tests/reactive.ts, run scoped; no `any` token, no empty block, no restating comment remains in src/reactive/object.ts.

## Verify
node -e "const s=require('fs').readFileSync('src/reactive/object.ts','utf8');process.exit(/\bany\b/.test(s)||s.includes('Skip isArray')?1:0)"

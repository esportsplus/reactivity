---
type: refactor
recommended-model: opus
status: PENDING
depends-on: none
api-impact: none
source: audit findings 1, 6 (src/reactive/index.ts bundle)
files-own: [src/reactive/index.ts]
tests: [tests/reactive.ts]
---

# reactive() facade cleanup: double-casts and import order

## Rationale
src/reactive/index.ts holds three `any` bridge casts on the `Reactive<T>` facade and an unsorted import block. Bundled so `files-own` stays non-overlapping.

## Changes
The `reactive()` entry point keeps identical construction, disposal registration, and error behavior; only the compile-time bridges and import layout change.

## Design
1. Imports (finding 6) — destructured group ordered external → `~/` → relative, alphabetical within each: `'@esportsplus/reactivity'`, `'@esportsplus/utilities'`, `'~/constants'`, `'~/types'`, `'./array'`, `'./object'`.
2. Facade casts (finding 1) — the `Reactive<T>` mapped type is a compile-time facade over the runtime ReactiveObject/ReactiveArray classes, so the bridge is inherently unverifiable and `unknown` is the sanctioned escape:
   - line 26: `new ReactiveObject(input) as any as Reactive<T>` → `as unknown as Reactive<T>`
   - line 29: `new ReactiveArray(...input) as any as Reactive<T>` → `as unknown as Reactive<T>`
   - line 44: `(value as any as { dispose: VoidFunction }).dispose()` → `(value as unknown as { dispose: VoidFunction }).dispose()`
3. Settled extension (same violation class, same file, not in the finding list — synthesizer decision): `Guard<T>`'s `T extends { dispose: any }` (line 11) becomes `T extends { dispose: unknown }`. Property positions check covariantly, so `{ dispose: unknown }` matches every `dispose` property type exactly as `any` did; the reserved-key rejection behavior is unchanged.

## Reads
- src/types.ts — the Reactive<T> facade the casts bridge to
- src/reactive/object.ts, src/reactive/array.ts — the runtime classes constructed here

## Acceptance
`tsc --noEmit` green; 0 regressions in tests/reactive.ts, run scoped; no `any` token remains in src/reactive/index.ts; the reserved-key `Guard` still rejects `{ dispose }` inputs at compile time (tests/reactive.ts type expectations unchanged).

## Verify
node -e "const s=require('fs').readFileSync('src/reactive/index.ts','utf8');process.exit(/\bany\b/.test(s)?1:0)"

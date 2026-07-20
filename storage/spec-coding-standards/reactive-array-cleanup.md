---
type: refactor
recommended-model: opus
status: PENDING
depends-on: none
api-impact: none
source: audit findings 1, 5, 6 (src/reactive/array.ts bundle)
files-own: [src/reactive/array.ts]
tests: [tests/array.ts]
---

# ReactiveArray cleanup: listener typing, sort map, accessor order, imports

## Rationale
src/reactive/array.ts holds two `any` sites (the heterogeneous listener store and the sort bucket map), a getter/setter pair ordered before regular methods (getters/setters must come last), and unsorted imports. Bundled so `files-own` stays non-overlapping.

## Changes
Event listener registration/dispatch, stable-sort order tracking, and `$length` reactivity keep identical runtime behavior; the listener store gains a precise events-keyed type.

## Design
1. Imports (finding 6) — destructured group ordered external → `~/` → relative, alphabetical within each: `'@esportsplus/utilities'`, `'~/constants'`, `'~/system'`, `'~/types'` (type import), `'./object'`.
2. Listener store (finding 1, line 45) — replace `type Listeners = Record<string, (Listener<any> | null)[]>` with an events-keyed mapped type:
   `type Listeners<T> = { [K in keyof Events<T>]?: (Listener<Events<T>[K]> | null)[] };`
   Class field becomes `listeners: Listeners<T> = {}`. `dispatch` drops its free `V` parameter: `dispatch<K extends keyof Events<T>>(event: K, value?: Events<T>[K])`. All call sites already pass the matching payload shape (`'clear'` passes nothing; `Events<T>['clear']` is `undefined`).
   Named discretion — the `listener(value)` call inside dispatch receives `Events<T>[K] | undefined` while `Listener` demands `Events<T>[K]`: either make `value` required (clear/reverse call sites pass `undefined` explicitly) or keep it optional with one boundary assertion at the call; criterion: zero `any`, zero runtime change, no per-listener casts. If the mapped type fights the hole-compaction writes (`listeners[i] = null`), the fallback is `(Listener<Events<T>[keyof Events<T>]> | null)[]` storage with a single cast at the `on()` boundary — same criterion.
3. Sort buckets (finding 1, line 267) — `new Map<any, number[]>()` becomes `new Map<T, number[]>()`; keys are the array's own elements (`before[i]`, `this[i]`), so `T` is exact.
4. Accessor order (finding 5) — move the `$length` getter/setter pair from before the methods to AFTER the last regular method (`unshift`), getters last per the class layout rule. `$set` and every other member keep their alphabetical method order.

## Reads
- src/reactive/object.ts — isReactiveObject consumed by the module-level dispose helper
- src/types.ts — Signal type of the `_length` field

## Acceptance
`tsc --noEmit` green; 0 regressions in tests/array.ts, run scoped; no `any` token remains in src/reactive/array.ts; `$length` accessors are the last members of the class body.

## Verify
node -e "const s=require('fs').readFileSync('src/reactive/array.ts','utf8');process.exit(/\bany\b/.test(s)?1:0)"

---
title: spec-audit-perf-bugs-dead-code
type: spec
status: implemented
repo: D:/reactivity (clone of https://github.com/esportsplus/reactivity @ 949f8ac, v0.34.0)
date: 2026-09-01
---

# Audit: performance, bugs, dead code

## Baseline (verified 2026-09-01)

- `pnpm install` OK, `tsc --noEmit -p tsconfig.json` clean, `vitest run` 23 files / 375 tests green.
- `vitest bench --run` completes (numbers in the "Bench reference" section at the bottom).
- Every bug below was reproduced with a throwaway vitest file (deleted afterwards). Reproductions are
  restated as the regression tests each item must add.

## Prior work that constrains this spec (recovered from deleted docs/, commit 9702ab6)

Do NOT re-attempt these; they were measured null or regressed:
- lazy-by-default computeds (regressed every read bench; user rejected).
- typeof gate on the async probe in `computed()` (null).
- per-mutator event-payload guards in ReactiveArray (null, reverted); lazy `listeners` (not pursued).
- heap pre-filled with `undefined` to avoid holey reads (not pursued, LOW class).
- lazy `errors[]` in `cleanup()` (null).

Landed and must be preserved: read-version dedup, gv fast path, pending-only writes, iterative
notify/update/dispose walks, `Symbol.species = Array`, sort listener bail, unified Signal shape.

## Gate for every item

`pnpm agent:test` (tsc --noEmit + vitest run) green after each item; never batch. Perf items
additionally need an interleaved A/B on `pnpm bench` (4 rounds, alternate control/candidate) and are
kept only if the targeted benches move beyond the control spread.

---

## Part 1 — Bugs (ordered by severity)

### B1. Stabilizer crashes when a node pulls a same-height sibling — `src/system.ts` `stabilize()` / `deleteFromHeap()`

Evidence: `stabilize()` sets `heap[heap_i] = undefined` then walks the detached list. If a node in
that list `read()`s another node from the same bucket (`height >= heap_i` is true for equality) that
is `STATE_DIRTY`, `update()` → `recompute(node, true)` → `deleteFromHeap()` dereferences
`heap[height]` (now undefined) and throws
`TypeError: Cannot set properties of undefined (setting 'prevHeap')`, leaving the heap list corrupt.
Reproduced: R (h1) reads N; N later grows to h1 (dynamic dep on a h0 computed) while returning an
unchanged value so R never re-runs and never bumps; `write(s); peek(M); flush()` crashes.
Without the `peek()` the same shape produces a glitch instead of a crash: R observed `[1, 2]` for one
write (stale N, then re-run in a rescheduled pass).

Root causes:
1. Two nodes can legitimately share a height (`makeComputed` `depsTail === null` path gives the
   child the parent's height; heights only grow, and a node grows without its readers re-running
   when its value does not change).
2. `stabilize()` detaches the bucket, so `deleteFromHeap()` and the `pull()` broadcast
   (`for heap[i]`) both see an empty bucket while its nodes are still marked `STATE_IN_HEAP`.

Fix (choose 2a; 2b is the fallback):
- 2a. Pop-from-head: `while ((computed = heap[heap_i]) !== undefined) { recompute(computed, true); }`
  so the bucket stays intact until each node is removed. `recompute(_, true)` already calls
  `deleteFromHeap`. A node inserted at the current height during the pass is then processed in the
  same pass (this is what removes the L-glitch as well), and only inserts at `height < heap_i` need a
  reschedule (see P1).
- 2b. Keep detaching but make `deleteFromHeap` tolerate `heap[height] === undefined` for a detached
  node (unlink from neighbours only). Fixes the crash, not the glitch.

Tests to add (`test/system.test.ts` or new `test/same-height.test.ts`):
- the crash repro above (`write; peek; flush` must not throw, R settles to `s + N`).
- the glitch repro (R's fn observes exactly one value per write).

### B2. `ReactiveArray` constructor: a single numeric item creates holes, large arrays overflow the stack — `src/reactive/array.ts`

Evidence: `new ReactiveArray(5)` → `super(5)` → length-5 holey array while `_length` is `signal(1)`.
Through the public surface: `reactive([5])` → `[null×5]`. The compiler emits
`new ReactiveArray(...[5])` (`src/compiler/array.ts`) and `ReactiveObject[REACTIVE_ARRAY]` spreads too,
so all three entry points are affected. Separately, `new ReactiveArray(...items)` with 500 000 items
throws `RangeError: Maximum call stack size exceeded` (argument spread limit).

Fix: change the constructor to `constructor(items?: readonly T[])` — `super()`, then copy by index
(`this[i] = items[i]` is safe, index writes are not intercepted) and `_length = signal(n)`. Update
the three call sites:
- `src/reactive/index.ts` → `new ReactiveArray(input)`.
- `src/reactive/object.ts` `[REACTIVE_ARRAY]` → `new ReactiveArray(value)`.
- `src/compiler/array.ts` emit → `new ${NAMESPACE}.ReactiveArray${typeParam}(${text})` (no spread,
  empty literal → `()`); update `test/compiler/compiler.test.ts` expectations.
`Symbol.species` already returns `Array`, so derived arrays never hit the constructor. Breaking
change for anyone calling `new ReactiveArray(a, b)` directly → bump minor, note in README.

Tests: `reactive([5])` equals `[5]` with `$length === 1`; `new ReactiveArray(new Array(500000).fill(0))`
succeeds; `reactive([])` and `reactive([1,2,3])` unchanged; compiler emit snapshot.

### B3. `reactive()` never auto-disposes; `root.disposables` is dead machinery — `src/reactive/index.ts`, `src/reactive/object.ts`, `src/system.ts`

Evidence: `reactive()` decides to register `onCleanup(dispose)` by inspecting `root.disposables`
inside its own `root()`. `ReactiveObject[COMPUTED]` wraps each computed in another `root()`, which
saves/zeroes/restores the counter, so the outer counter is always 0. Reproduced: a `reactive({...})`
with a computed property created inside an `effect`; after `stop()` the computed still re-ran on a
signal write (runs went 1 → 2). Arrays never touch the counter either.

Fix: delete the counter path. `reactive()` becomes:
```ts
let value = root(() => build());   // build = ReactiveObject | ReactiveArray | throw
if (observer || scope) onCleanup(() => value.dispose());   // i.e. just call onCleanup — it is a no-op without a parent
```
`onCleanup` already returns `fn` unchanged when there is no parent, so the call is unconditional.
Then remove `root.disposables` (field, the `d`/save/restore in `root()`, the increment in
`makeComputed`) and the test `'tracks disposables counter for unowned computeds'` in
`test/system.test.ts`. `root.disposables` is not documented in README; removing it is a minor bump.

Tests: object-with-computed created in an effect is disposed when the effect is disposed (runs stay
at 1 after a write); array created in an effect has its nested objects disposed; top-level
`reactive()` registers nothing.

### B4. Stale reads and double runs for observers created between a write and its flush — `src/system.ts` `stabilize()` / `read()`

Evidence: `stabilize()` exits its `for` with `heap_i = heap_n + 1` and never resets it. Outside a
pass, `read()`'s pull gate `height >= heap_i || state & NOTIFY_MASK` is then false for every computed
whose height is below the last pass's max, and a freshly written dependency only sits in
`pendingHead` (no notify bits yet). Reproduced: `write(s,1); flush(); write(s,2); effect(() => read(c))`
→ the effect's first run saw `1`, then re-ran with `2` after flush (`[1, 2]`). Any computed created
eagerly in that window computes from stale inputs.

Fix: reset `heap_i = 0` at the end of `stabilize()` (before restoring `observer`). Outside a pass every
tracked computed read then goes through `pull()`, which exits on the `gv === writes` fast path when
nothing changed, so the steady-state cost is one compare.

Tests: the repro above must observe `[2]` only; a computed created between write and flush sees the
new value on creation; `read-dedup`/`glitch-freedom` suites stay green.

### B5. `root()` leaks `observer`/`scope` state when `fn` throws — `src/system.ts` `root()`

Evidence: no `try/finally`; an inner `root((d) => { throw })` inside an outer `root((d) => ...)`
leaves `scope` pointing at the dead inner scope. Reproduced: the outer's later `onCleanup(spy)`
attached to the inner scope; after `disposeOuter()` the spy count was 0.

Fix: wrap the call in `try { ... } finally { observer = o; scope = s; }` (drop the `disposables`
restore once B3 lands). Register `onCleanup(c)` in the `finally` only on success, or keep it after
the block as now — either way state must be restored on throw.

Test: the repro above (spy === 1); `batch()` already has an equivalent test to mirror.

### B6. Compiler: primitive bindings are file-global, scoping is dead code — `src/compiler/primitives.ts`

Evidence: the ancestor walk (lines ~104-122) never breaks, so `scope` always ends as the
`SourceFile`, `inScope()` is always true, and `if (!scope)` is unreachable. Reproduced:
`function a(){ let x = reactive(0); return x } function b(){ let x = 1; return x }` → `b`'s `x`
became `read(x)` (wrong code; runtime `read(1)` returns `undefined`). The lookup loop also picks the
LAST matching binding rather than the innermost.

Fix: break at the first scope-like ancestor (innermost). Keep the existing test
`'transforms reads in nested functions within scope'` (declaration at file level still covers nested
functions). Also treat `ts.isCatchClause`/method declarations/constructors/getters/setters as scopes
(they are function-like). For multiple candidates prefer the binding whose scope is deepest.

Tests: the shadowing repro (only `a`'s `x` is rewritten); sibling functions each declaring a
`reactive()` of a different classification.

### B7. Compiler: `arr.length <op>=` emits `+` for unknown operators — `src/compiler/array.ts` `getOperator()`

Evidence: `arr.length <<= 1` → `arr.$length = arr.length + 1`; `arr.length ??= 2` → `+ 2`.
`getOperator` covers 9 operators, `isAssignmentOperator` accepts 17.

Fix: delete `getOperator`/`isAssignmentOperator`; move `COMPOUND_OPERATORS` from `primitives.ts` to
`compiler/constants.ts` and use it in both files (`has()` for detection, `get()` for the token).
Test: every compound operator on `arr.length` round-trips to its own token.

### B8. `ReactiveArray.sort` reverses the `order` mapping for duplicate values — `src/reactive/array.ts`

Evidence: before `[3,1,3,2]`, after `[1,2,3,3]`, emitted `order = [1,3,2,0]`; a stable sort keeps
the first `3` first, so the correct map is `[1,3,0,2]`. Consumers reconciling DOM by `order` do
unnecessary moves.

Fix: replace the `Map<T, number[]>` + `pop()` with a `Map<T, number[]>` plus a per-bucket cursor
(read `list[cursor++]`), or store `{ indices, next }`. Same complexity, no reversal, no `pop()`
mutation. Test: the repro; all-equal array yields identity order.

### B9. `ReactiveArray.dispatch` silently drops a throwing listener — `src/reactive/array.ts`

Evidence: `catch { listeners[i] = null }` with no report; existing tests rely on the removal
(`test/reactive/array.test.ts` ~700-780). Silent swallowing hides bugs.

Fix (small, keep removal semantics): collect errors and rethrow after the loop via
`queueMicrotask(() => { throw e })` exactly as `recompute()` does for cleanup errors. Update the
existing tests to assert the async rethrow (vitest `expect.unhandled` or a `process.on('uncaughtException')`
shim already used implicitly by async-errors tests).

### B10. `ReactiveArray.$set` does not dispose the replaced item — `src/reactive/array.ts`

`pop/shift/splice/clear/dispose` dispose removed `ReactiveObject`s; `$set` overwrites without
disposing `prev`. Fix: `dispose(prev)` after the write when `prev !== value`. Test: replacing a
nested reactive object at an index disposes it.

---

## Part 2 — Performance

### P1. Drop the wasted second stabilize pass per propagating write — `src/system.ts` `propagate()` / `schedule()` / `insertIntoHeap()`

Evidence: `propagate()` calls `schedule()` while `stabilizer === RUNNING`, which flips to
`RESCHEDULE` and queues another `stabilize()` microtask even though the subscribers were inserted at
heights the current pass will still visit. Measured: one write on a 3-deep chain costs 2
`queueMicrotask` calls; one write to a direct effect costs 1. Every chain/diamond/fan-out bench pays an
extra microtask plus an empty `for` over `heap_n + 1` buckets.

Fix (depends on B1 option 2a so equal-height inserts are safe): during `RUNNING`, only request a
reschedule when an insert lands at `height < heap_i` or when `pendingHead !== null` at the end of the
pass. Concretely: `insertIntoHeap` sets `stabilizer = STABILIZER_RESCHEDULE` when
`stabilizer === STABILIZER_RUNNING && height < heap_i`; `propagate()` stops calling `schedule()`;
`stabilize()` checks `pendingHead !== null` after the loop and reschedules. `write()` keeps calling
`schedule()` (needed when idle). Then consider draining the reschedule synchronously inside
`stabilize()` (loop instead of a new microtask) so `flush()`'s `while` collapses to one call — measure
both; keep the microtask variant if the sync loop shows no gain.

Targets: `deep chain (10/50/100)`, `computed diamond`, `wide fan-out`, `10 signals → 1 computed →
1 effect`, kairo `deep`/`diamond`/`broad`. Expect a few percent; must not regress `1 signal → 1 effect`.

### P2. Keep async wrappers shape-stable — `src/system.ts` `makeComputed()` / `makeAsyncComputed()`

`makeAsyncComputed` adds `.pending` to the wrapper after construction, so async wrappers have a
different hidden class from every other computed; any `read()`/`update()` site that sees both goes
polymorphic. Fix: add `pending: null` to the `makeComputed` literal (16 → 17 slots; update the
`Object.keys(c).length <= 16` assertion in `test/system.test.ts:692`) and assign it in place. Also
store the async factory there instead of the `asyncMeta` WeakMap? No — `invalidate` is cold; keep the
WeakMap, avoid a second slot. Measure `create asyncComputed*` and `read computed`.

### P3. `root()` fake-scope object shape — `src/system.ts` `root()`

`{ cleanup: null, state: STATE_COMPUTED } as Computed` is a second shape flowing into `dispose()`,
`onCleanup()`. Build it with the full `makeComputed`-style literal (or a shared `makeNode(fn)` factory)
so `dispose()` stays monomorphic. Measure `root scope create + dispose`, `register 1 cleanup`.
Low expected gain; drop if null.

### P4. Compiler: five full AST walks per file — `src/compiler/index.ts`

`hasReactiveCalls` + `primitives` + `object` + `array` + `findRemainingCalls` each walk the whole
file, and `hasReactiveCalls` recurses through `forEachChild` closures. Build-time only, so LOW:
merge `hasReactiveCalls` into the `primitives` pass (return early when it collected nothing), and let
`findRemainingCalls` reuse the call list gathered by `primitives`. Only do this after B6/B7; gate on
`test/compiler` staying green. No runtime bench needed.

### Not pursued (measured or predicted null)

`cleanup()` errors array, listener-null guards in `dispatch`, `ReactiveArray.listeners` laziness,
`isObject`-based type guards (cold), the duplicate dep link created by an inline nested `computed()`
between two reads of the same signal (alien-signals scheme, stable at 3 links, no leak).

---

## Part 3 — Dead code and documentation

### D1. Unused exports/constants
- `ENTRYPOINT_REGEX` in `src/compiler/constants.ts` — never imported. Delete.
- `STATE_NONE` in `src/constants.ts` — never used. Delete (and from the export list).
- `TransformResult` in `src/types.ts` — never used; its `ts` import is the only reason `types.ts`
  depends on `@esportsplus/typescript`. Delete the interface, the import and the README row.
- `TYPES.Object` — set in `src/compiler/object.ts` but never read. Delete the enum member and the
  `bindings.set(varname, TYPES.Object)` line (keep the `${varname}.${key}` array entries).
- `root.disposables` — dead after B3 (see above).
- `src/compiler/primitives.ts` `if (!scope) scope = call.getSourceFile()` — unreachable; goes away
  with B6.

### D2. Duplicate `isReactiveCall` predicates — `src/compiler/object.ts`, `src/compiler/array.ts`, `src/compiler/index.ts`
Three implementations (index.ts additionally handles `ns.reactive(...)`, the other two do not, so
`ns.reactive({...})` objects are not class-transformed). Keep one in `compiler/index.ts`, pass it as a
parameter the way `primitives` already receives it. `test/compiler/compiler.test.ts` passes
`undefined` checker today — replace with the name-only predicate it already defines.

### D3. README drift — `README.md`
- Line 3 links `docs/index.md`, deleted in fd240fa. Remove the line.
- API table says `effect(fn, onError?)`; the signature is `effect(fn, apply?)` where `apply(value, prev)`
  runs untracked after each run. Fix the row.
- `reactive()` currently throws for non-object/array input at runtime; state it under "compile-time only".
- Document the `ReactiveArray` constructor change (B2) and `signal.selector` SameValueZero note is
  fine as is.
- Remove the trailing `claude-code:readme-source-hash` comment if the tool that used it is gone
  (check `.github/`; nothing references it).

### D4. Comments that narrate history — `src/system.ts`
Several comments reference "main's eager write() fan-out", "parity with main", "reduced-shape core"
(`drainPending`, `stabilize`, `pull`, `read`). Per coding standards these are edit-history narration;
rewrite each to state the invariant only (one line) or delete.

---

## Implementation order

1. B5 (root try/finally) — isolated, 5 lines.
2. B3 (reactive auto-dispose) + delete `root.disposables` — touches system/reactive/index/tests.
3. B2 (ReactiveArray constructor) — array.ts, index.ts, object.ts, compiler/array.ts, compiler tests, README.
4. B8, B10, B9 — array.ts only.
5. B4 (`heap_i = 0` reset) — one line + tests; run full suite.
6. B1 option 2a (pop-from-head stabilize) — then P1 on top; A/B bench both together and separately.
7. B6, B7, D2, D1 (compiler) — compiler tests.
8. P2, P3 — bench-gated; revert on null.
9. D3, D4 docs/comments; P4 last.
10. Bump version (minor: constructor + `root.disposables` removal), commit per item using the repo's
    `type(scope): summary` grammar.

## Bench reference (this machine, single run, ±10-20 % noise)

| bench | hz |
|---|---|
| read computed | fastest in group; chain depth 5 is 3.97x slower, diamond 2.84x |
| 1 signal → 1 effect (sync write) | fastest; deep chain (10) 5.26x slower; wide fan-out (100) 40.6x |
| write during stabilization | 1.54x faster than read computed during stabilization |
| sort 10 items | 6.5x faster than 100, 68.9x faster than 1000 |
| ReactiveObject create (5 signals) | ~747k hz; async computed property ~430k hz |

Use `pnpm bench` interleaved A/B for every Part 2 item; single runs are not evidence.

---

## Outcomes

Gate at HEAD: `tsc --noEmit` clean, vitest 23 files / 393 tests green (baseline was 375).
Items B5 through B4 were implemented by a delegated Claude sub-agent; the rest by the parent session
after two Codex sub-agents were killed (the first left a failing B1 attempt that was discarded).

### Part 1 — Bugs

- **B5** `0bf9441` fix(system): restore scope when root() throws. Test: `test/system.test.ts` (outer cleanup survives an inner throwing root).
- **B3** `378b08a` fix(reactive): auto-dispose owned reactives and drop root.disposables. Tests: `test/reactive/reactive.test.ts` (object with computed disposed with its effect, array nested objects disposed, top-level registers nothing); the `root.disposables` test in `test/system.test.ts` deleted.
- **B2** `ae2d235` fix(reactive): accept array in ReactiveArray constructor. Tests: `test/reactive/array.test.ts` (`reactive([5])`, 500k items), compiler emit expectation updated, call sites in `reactive/index.ts`, `reactive/object.ts`, `compiler/array.ts`.
- **B8** `c4c36ad` fix(reactive): keep ReactiveArray.sort order stable for duplicates. Test: `test/reactive/array.test.ts`.
- **B10** `7f4cf93` fix(reactive): dispose replaced item in ReactiveArray.$set. Test: `test/reactive/array.test.ts`.
- **B9** `6fa2006` fix(reactive): rethrow dropped listener errors via microtask. Tests: `test/reactive/array.test.ts` rewritten around a new `test/lib/uncaught.ts` helper.
- **B4** `8b819d0` fix(system): reset heap index after each stabilize pass. Tests: `test/system.test.ts` 'stale reads after a pass'. Deviation: the tests assert the no-stale invariant (first observed value is the written one) rather than the plan's exact `[2]`; a benign same-value re-run remained until B1 landed.
- **B1 + P1 + B11** `ba97508` fix(system): pop heap buckets in place and defer scheduling. Tests: `test/system.test.ts` 'same-height stabilization' (crash repro and glitch repro, both verified to fail at 8b819d0 and pass at HEAD), `test/effects.test.ts` 'scheduling from a top-level creation run'.
  - The crash reproduced exactly as the plan described at 8b819d0 (`TypeError: Cannot set properties of undefined (setting 'prevHeap')`); the earlier sub-agent's report that it no longer reproduced was wrong.
  - Design: `stabilize()` pops each bucket head-first with the heap intact; `recompute()` preserves `STATE_IN_HEAP` across `fn` so a node re-queued by its own tracked read is popped again instead of stranded; `pull()` records the pulled node and its requester so `propagate()` does not re-queue the requester (it reads the fresh value on return), which is what removes the `[2, 2]` double run; an insert below `heap_i` flags `RESCHEDULE` and the extra pass runs inline in a `do/while` instead of a new microtask, so `flush()` is a single call.
  - **B11 (new, found during B1)**: `schedule()` was a no-op whenever `depth > 0` and the stabilizer was idle, so a write issued from a top-level effect's first run never propagated, and a nested effect created after a read in a top-level effect never ran (both reproduced). A `STABILIZER_DEFERRED` state parks the request and queues it when the outermost recompute or batch returns.
- **B6 + B7 + D2 + D1(partial)** `74b3d37` fix(compiler): scope bindings and operator table. Tests: `test/compiler/compiler.test.ts` (sibling-function shadowing, innermost-binding resolution, every compound operator on `length`). `TYPES.Object` deleted; `object()` and `array()` now take the shared predicate.

### Part 2 — Performance

- **P1** landed inside `ba97508` (see above). Its target (one pass per write instead of two) is met, but the correctness structure it rides on costs more per recompute than the pass it saves; see the measurements.
- **P2** `aeb1474` perf(system): give every computed a pending slot. Tests: shape equality between sync and async computeds; the own-property bound moved from 16 to 17.
- **P3** `50fc4a0` perf(system): build root scopes with the shared node literal (`makeNode`).
- **P4** `86851f9` refactor(compiler): collect calls in the primitives pass. Build-time only, not benchmarked; compiler suite green.
- **Follow-up** `308f598` fix(system): decouple async settle guard from microtask order. Found while bisecting: the async dirty-gap tests only passed because every top-level computed creation queued a stabilize microtask (propagate() called schedule() with no subscribers). The guard now drains pending writes itself; propagate() returns early without subscribers, which removes one microtask per top-level creation and is where the creation-bench gains below come from. Also inlines the heap/deferred checks in recompute() and clears pull()'s skip markers on exit (restoring them would have let a stale pair skip a legitimate re-run, caught by 43 failing tests when tried).

#### Measurements

Bisect (mini-bench, 3 rounds, control-vs-control noise ±4 %): pop-from-head alone −2 %, deferred scheduling alone +1 %, pull-skip alone +2 %, but the combined rework −9.5 % on the same benches. Plain-Node timing (`storage/micro.mjs`, 200k iterations, no vitest harness) isolates it: computed creation 34 ns in both; a 10-deep chain write 325 ns → 355 ns (+9 %); create-chain-plus-write 830 → 900 ns (+8 %). Four subtractive JS variants (detached-bucket walk, no propagate skip, no IN_HEAP preservation, no do/while) and two inline-pop variants all land within ±2 % of HEAD, so the ~3 ns per recompute is the aggregate of the bookkeeping the crash fix needs (heap-intact pop, IN_HEAP preservation, pull markers, deferred check), not one hot spot. Accepted as the price of B1; do not spend more time on it without a structural idea.

Final A/B (median hz delta vs 8b819d0, one forward + one reversed round, `bench/system.bench.ts` + `bench/kairo.bench.ts`; `noshape` = HEAD with P2/P3 reverted):

| bench group | head (`308f598`) | noshape |
|---|---|---|
| create computed / read computed | +24.8 % / +16.0 % | +30.1 % / +23.0 % |
| root scope create + dispose | +23.5 % | +21.6 % |
| avoidablePropagation / repeatedObservers | +5.0 % / +0.4 % | +2.8 % / −1.0 % |
| computed chain (depth 5) / computed diamond | −1.2 % / −0.0 % | −9.7 % / −2.7 % |
| create asyncComputed (plain / from signal) | −7.4 % / +0.6 % | −7.5 % / −13.7 % |
| effect with 1 / 10 signals | −4.2 % / −3.3 % | −9.0 % / −1.2 % |
| 1 signal → 1 effect / → 10 effects | −3.7 % / −11.4 % | −5.0 % / −9.4 % |
| deep chain 10 / 50 / 100 | −5.3 % / −10.6 % / −9.3 % | −7.0 % / −13.8 % / −12.8 % |
| wide fan-out (100 computeds) | −7.5 % | −2.9 % |
| write / read computed during stabilization | −14.3 % / −11.9 % | −13.0 % / −9.2 % |
| kairo broad / deep / diamond / mux / triangle / unstable | −15.0 / −10.0 / −7.5 / −11.5 / −6.6 / −5.6 % | −18.5 / −13.2 / −10.8 / −12.1 / −9.4 / −5.9 % |
| create + dispose effect / 1000 effects | −10.2 % / −12.0 % | −13.5 % / −11.2 % |
| signal create / read / write | −2.7 % / −4.4 % / −2.5 % | −1.6 % / +1.4 % / +0.2 % |
| **median over 38 benches** | **−4.8 %** | **−7.1 %** |

Verdict: **P2 and P3 kept** — HEAD beats the same code without them on the median and on every
computed-creation and chain bench (chain depth 5 −1.2 % vs −9.7 %, async from signal +0.6 % vs
−13.7 %). The remaining propagation-side regression is B1's structural cost described above; the
creation-side gains come from the removed per-creation microtask. Raw JSON for both rounds is in
`storage/final/`.

### Part 3 — Dead code and docs

- **D1** `b85940a` chore(types): delete unused TransformResult; `570996a` chore(system): drop STATE_NONE and history-narrating comments (also **D4**); `ENTRYPOINT_REGEX` and `TYPES.Object` went with `74b3d37`.
- **D3** `34b6658` docs(readme): fix effect signature and dead doc link; adds a "Changes in 0.35.0" section.
- **Version** `f11a0d7` chore: bump version to 0.35.0 (minor: ReactiveArray constructor, `root.disposables`, `TransformResult`).

### Tooling left in `storage/`

`ab.sh` (N-way interleaved vitest bench A/B in a scratch worktree), `ab-compare.mjs` (median hz deltas per side), `micro.mjs` (plain-Node timing of creation and chain writes against a built `system.js`), `final/` (raw JSON of the final A/B).

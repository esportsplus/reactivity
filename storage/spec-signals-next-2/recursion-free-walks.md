---
api-impact: none
benchmarks: [tests/bench/system.ts, tests/bench/kairo.ts]
depends-on: [benchmark-harness, global-version-fast-path, unobserved-hooks]
files-own: [tests/deep-graphs.ts]
files-shared: [src/system.ts]
priority: P2
recommended-model: opus
status: PENDING
tests: [tests/deep-graphs.ts]
type: refactor
---

# Recursion-free notify(), update(), and dispose()/unlink() walks

## Rationale

The height-bucketed heap already makes stabilize() iterative; notify/update were the two known O(depth) call-stack consumers — but the predecessor run proved a THIRD: dispose()/unlink() mutual recursion overflowed on 200k-deep teardown, a path the source Design never addressed, so tests/deep-graphs.ts could never pass (its own stop() teardown was the overflow). This re-authoring keeps the two settled conversions and adds the teardown drain as an explicit third target with its own acceptance clause. alien-signals eliminates call-stack recursion with explicit linked stacks `{ value, prev }` (S3 finding 3).

## Changes

- Propagation subsystem: iterative notify() and update() walks with a shared free-listed stack.
- Teardown subsystem: iterative dispose()/unlink() cascade via a free-listed drain (no mutual recursion), carrying the onUnobserved fire site with it.
- New scoped suite tests/deep-graphs.ts covering deep chains, broad trees, diamond semantics, and deep teardown.

## Design

Three recursion sites, three conversions. Behavioral change: NONE on the first two (mechanical de-recursion; every existing test passes unmodified); the third changes only cross-node teardown ORDER (see residue pin). New capability: graphs ≥ 200k deep neither overflow nor misorder, in propagation AND teardown.

**Shared stack free-list**: one module-level pool of `{ value, prev }` stack nodes mirroring the linkPoolHead pattern (declaration src/system.ts:16, reuse in link() :188-207, return-to-pool in unlink() :452-455) so steady-state deep walks allocate nothing. Implementer decides whether one pool serves all three walks or the dispose drain threads its own; criterion: zero steady-state allocation on repeat walks, tsc-clean with zero `any`.

**notify()** (src/system.ts:224-236; recursion at :233-235): convert to an iterative walk. Shape: process a node, then its sub-links; when a sub has its own subs, push the CURRENT link position onto a stack `{ value: link, prev }` and descend; on exhaustion pop. Preserve the exact semantics: the `(state & STATE_NOTIFY_MASK) >= newState` early-prune, and the newState split — only the ROOT call uses a non-CHECK newState (pull()'s heap broadcast at :240-256 passes STATE_DIRTY); descendants always receive STATE_CHECK, so the iterative form carries `newState` for the root node only and hardcodes CHECK below, exactly as today.

**update()** (src/system.ts:460-491; dep-chain descent at :469-481): convert the CHECK-dep descent to an explicit stack: push `{ value: currentLink, prev }` when descending into a CHECK dep, resume from the stored link on pop. Preserve: the DIRTY-break (`if (computed.state & STATE_DIRTY) break;` at :476-478 — a descendant recompute may have dirtied us; stop checking further deps), the `recompute(computed, true)` on DIRTY (:483-485), and the notify-mask clearing on exit for EVERY node popped — including the global-version fast-path exit (:463-467), which must keep clearing the mask on its O(1) leave. Recursion in recompute() itself (nested computed creation) is USER-driven nesting and stays.

**dispose()/unlink() teardown (the added third target — the predecessor's actual overflow)**: dispose() (src/system.ts:605-626) and unlink() (:421-458) mutually recurse through the zero-subs branch (:437-450): `dispose(dep)` at :439 re-enters unlink for each of the disposed node's own deps — depth = chain length, RangeError at 200k. Convert to an iterative drain:

- Introduce `queueDispose(computed)`: push the node onto a module-level free-listed worklist; if a drain is already active (module-level flag), return — the running drain's loop picks it up; otherwise drain: pop a node, deleteFromHeap, walk its deps unlinking each (which may enqueue more), run cleanup(), run disposal(), fire its unobservers entry (see relocation pin), repeat until empty, clear the flag.
- unlink()'s zero-subs COMPUTED branch calls queueDispose(dep) instead of dispose(dep); the selector-entry eviction (:441-449) stays inline — it never recurses.
- The public dispose() becomes `queueDispose(computed)` — every current call site (effect disposers :653-655, computed onCleanup registrations :591/:598, wrapper disposal, recompute's stale-dep prune :328-340 reaching unlink) flows through the same drain, and because queueDispose drains immediately when no drain is active, every site keeps its current synchronous completion semantics.
- Exactly-once pin: a node already enqueued or already torn down must not double-enqueue; implementer decides the guard (drain-membership bit or field sentinel); criterion: cleanup and disposal run exactly once per node, double-dispose stays the no-op it is today.
- Re-entrancy pin: cleanup()/disposal() callbacks may themselves call dispose()/stop() — those calls enqueue into the running drain (no recursion, no double-teardown).
- **onUnobserved fire-site relocation** (consumes the artifact landed by unobserved-hooks): the callback fire moves with the teardown — for an enqueued computed it fires in the drain immediately after that node's disposal() (preserving the per-node contract: deps unlinked → cleanup → disposal → unobserved callbacks); for non-enqueued deps (plain signals, selector entries) it stays inline in the zero-subs branch exactly as landed. tests/unobserved.ts must pass unmodified — that suite IS the relocation contract.
- **Ordering residue (judgment — critic validates)**: the recursive form tears down deps-first (a dep's cleanup ran before its owner's); the drain runs owner-first unless LIFO order restores depth-first traversal. Recommended: LIFO (stack) drain — closest to today's order; FIFO acceptable only if the scoped suites named in Verify stay green. No existing test asserts cross-node teardown order; within-node order is pinned above and non-negotiable.

## Reads

- src/system.ts — notify()/update()/pull() broadcast, dispose()/unlink() cascade, linkPoolHead pattern to mirror (anchors above)
- tests/glitch-freedom.ts — invariants the conversion must preserve
- tests/system.ts — dynamic-height and CHECK/DIRTY coverage that must pass unmodified
- tests/unobserved.ts — the fire-site relocation contract (landed by unobserved-hooks, earlier in this spec)

## Acceptance

1. A 200k-deep computed chain: write at the root settles to the correct leaf value with no RangeError, via both the scheduled path (microtask settle) and the pull path (tracked read mid-cycle triggering the heap broadcast + update walk).
2. A broad tree (fan-out 100 x depth 1k) settles correctly (notify's sibling traversal survives the conversion).
3. Diamond/dynamic-dep semantics unchanged: the DIRTY-break short-circuit still prevents redundant dep checks (assert recompute counts on the reactively 3-state scenarios — S3 finding 7).
4. Teardown survives depth: stop() on the effect terminating a 200k-deep chain completes with no RangeError; onCleanup fires exactly once per instrumented node; a subsequent write to the root signal re-runs nothing.
5. 0 regressions in tests/deep-graphs.ts run scoped; `pnpm exec tsc --noEmit` green.

## Directives

1. src/system.ts — module-level `{ value, prev }` stack-node free-list (linkPoolHead pattern) + iterative notify() preserving the early-prune and root-only newState semantics.
2. src/system.ts — iterative update() preserving the DIRTY-break, recompute-on-DIRTY, and exit-mask clearing (including the gv fast-path exit) semantics.
3. src/system.ts — queueDispose() free-listed teardown drain replacing the dispose()/unlink() mutual recursion, with the onUnobserved fire-site relocation and exactly-once/re-entrancy guards.
4. tests/deep-graphs.ts — acceptance 1-4 as concrete tests (deep chain scheduled + pull, broad tree, diamond recompute counts, 200k teardown with cleanup counting).

## Verify

Run `pnpm run bench tests/bench/system.ts tests/bench/kairo.ts` before/after and compare via `node core/gates.ts bench-gate` (thresholds: contracts/budgets.json `bench.*`) — a refactor item still must not regress the hot paths; regression → revert via git checkout. Ordering-contract cross-checks, run scoped: `pnpm run test tests/unobserved.ts`, `pnpm run test tests/effects.ts`, `pnpm run test tests/system.ts`, `pnpm run test tests/glitch-freedom.ts`. Traversal-order and teardown-order equivalence is the judgment residue — critic validation.

## Notes

Re-authored from storage/spec-signals-next recursion-free-walks (BLOCKED: real spec gap — the source Design de-recursed only notify()/update() while the actual overflow sat in the dispose()/unlink() mutual recursion its own test's teardown exercised). Discharge via `finalize-directory --migrated-to`. Depends-on adds unobserved-hooks relative to the source item: the fire-site relocation consumes the artifact that item lands — a real edge, not padding; benchmark-harness and global-version-fast-path are predecessor-consumed artifacts carried verbatim.

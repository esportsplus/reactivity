---
api-impact: none
depends-on: [benchmark-harness, global-version-fast-path]
files-own: [tests/deep-graphs.ts]
files-shared: [src/system.ts]
priority: P2
recommended-model: opus
status: PENDING
tests: [tests/deep-graphs.ts]
type: refactor
---

# Recursion-free notify() and update() walks

## Design

alien-signals eliminates call-stack recursion with explicit linked stacks `{ value, prev }` (S3 finding 3). Two of our propagation paths recurse and overflow on deep graphs:

- notify() (src/system.ts:175-187): recurses once per subscriber EDGE down the whole sub-tree — a 100k-deep chain of computeds overflows during the read-path heap broadcast (:486-497).
- update() (:337-357): recurses along dep chains during the CHECK pull — depth = graph height.

**notify()**: convert to an iterative walk. Shape: process a node, then its sub-links; when a sub has its own subs, push the CURRENT link position onto a stack `{ value: link, prev }` and descend; on exhaustion pop. Preserve the exact semantics: the `(state & STATE_NOTIFY_MASK) >= newState` early-prune (only the ROOT call uses a non-CHECK newState — descendants always receive STATE_CHECK, so the iterative form carries `newState` for the root node only and hardcodes CHECK below, exactly as today).

**update()**: convert the dep-chain descent to an explicit stack: push `{ value: currentLink, prev }` when descending into a CHECK dep, resume from the stored link on pop. Preserve: the DIRTY-break (`if (computed.state & STATE_DIRTY) break;` — a descendant recompute may have dirtied us; stop checking further deps), the recompute(computed, true) on DIRTY, and the notify-mask clearing on exit for EVERY node popped (including the global-version fast-path exit landed earlier). Recursion in recompute() itself (nested computed creation) is USER-driven nesting and stays.

**Stack node allocation**: module-level free-list identical in pattern to linkPoolHead (:139-158) so steady-state deep walks allocate nothing.

Behavioral change: NONE — this is a mechanical de-recursion; every existing test must pass unmodified. New capability: graphs ≥ 100k deep neither overflow nor misorder.

## Rationale

The height-bucketed heap already makes stabilize() iterative; notify/update are the two remaining O(depth) call-stack consumers — the difference between "handles any graph the template compiler emits" and a RangeError in production.

## Changes

- src/system.ts: iterative notify(), iterative update(), shared stack free-list.
- tests/deep-graphs.ts: new.

## Acceptance

1. A 200k-deep computed chain: write at the root settles to the correct leaf value with no RangeError, via both the scheduled path (microtask settle) and the pull path (tracked read mid-cycle triggering the heap broadcast + update walk).
2. A broad tree (fan-out 100 x depth 1k) settles correctly (notify's sibling traversal survives the conversion).
3. Diamond/dynamic-dep semantics unchanged: the DIRTY-break short-circuit still prevents redundant dep checks (assert recompute counts on the reactively 3-state scenarios — S3 finding 7).
4. 0 regressions in tests/deep-graphs.ts run scoped; `pnpm exec tsc --noEmit` green.

## Reads

- src/system.ts — notify()/update()/read() broadcast + linkPoolHead pattern to mirror
- tests/glitch-freedom.ts — invariants the conversion must preserve
- tests/system.ts — dynamic-height and CHECK/DIRTY coverage that must pass unmodified

## Directives

1. src/system.ts — iterative notify() with the free-listed stack.
2. src/system.ts — iterative update() preserving the DIRTY-break and exit-mask semantics.
3. tests/deep-graphs.ts — acceptance 1-3.

## Verify

Traversal-order equivalence is the judgment residue — critic validation. Run `pnpm run bench tests/bench/system.ts tests/bench/kairo.ts` before/after and compare via `node core/gates.ts bench-gate` (thresholds: contracts/budgets.json `bench.*`) — a refactor item still must not regress the hot paths; regression → revert via git checkout.

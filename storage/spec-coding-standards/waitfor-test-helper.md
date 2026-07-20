---
type: test
recommended-model: opus
status: PENDING
depends-on: none
api-impact: none
source: audit finding 2
files-own: [tests/lib/wait-for.ts, tests/async-computed.ts, tests/async-errors.ts, tests/async-hardening.ts, tests/async-iterable.ts, tests/async-nested.ts, tests/effects.ts, tests/errors.ts, tests/invalidate.ts, tests/reactive.ts, tests/system.ts]
tests: [tests/async-computed.ts, tests/async-errors.ts, tests/async-hardening.ts, tests/async-iterable.ts, tests/async-nested.ts, tests/effects.ts, tests/errors.ts, tests/invalidate.ts, tests/reactive.ts, tests/system.ts]
---

# waitFor helper: replace fixed sleeps with condition polling

## Rationale
50 occurrences of `await new Promise((r) => setTimeout(r, N))` across 10 suite files use wall-clock sleeps as synchronization. The rule: poll the actual condition (~10ms interval); a fixed delay is permitted only where wall-clock time IS the tested contract. Magic 10/20ms "let it settle" delays are timing-luck assertions that flake under load.

## Changes
Test synchronization only — suites assert the same behaviors, but wait on observable conditions instead of the clock. No source-module changes.

## Design
1. New helper `tests/lib/wait-for.ts` (a helper, deliberately NOT matching `*.test.*`), exporting:
   - `waitFor(condition: () => boolean, description: string, timeoutMs = 1000): Promise<void>` — polls `condition` every ~10ms; resolves as soon as it returns true; rejects with `new Error('wait-for: timed out waiting for ' + description)` at the deadline.
   - `tick(times = 1): Promise<void>` — awaits `times` macrotask turns (`setTimeout(..., 0)`), for sites whose contract IS "one scheduler turn".
2. Per-site conversion criterion (50 sites: async-computed 21, async-errors 8, reactive 5, async-hardening 4, errors 3, effects 3, invalidate 2, async-nested 2, system 1, async-iterable 1):
   - The code after the sleep asserts an observable state (a signal/computed value, an effect-run counter, an error field) → replace the sleep with `await waitFor(<that exact predicate>, '<description>')`, then keep the assertions.
   - A bare `setTimeout(r, 0)` that exists to yield past the microtask-scheduled propagation (this library schedules stabilization on microtasks — see the withBatch note in tests/lib/reactive-adapter.ts) before asserting → `await tick()`; the zero-delay macrotask yield IS the contract there.
   - Any N>0ms "let it settle" delay is a violation: convert to waitFor. A fixed positive delay may survive ONLY with a one-line call-site justification naming the wall-clock contract being tested; expected count of such survivors: zero.
3. Discretion points: per-site timeoutMs (default 1000) and whether a given site's condition is genuinely observable vs a pure scheduling yield; criterion: every converted suite must be deterministic on a loaded machine — no assertion may depend on how much work fit inside a fixed delay.

## Reads
- tests/lib/reactive-adapter.ts — the existing microtask-propagation note (withBatch) grounding the tick() contract

## Acceptance
0 regressions in the 10 converted suites, run scoped; no `setTimeout(r, N)`-sleep with N > 0 remains in the 10 files except sites carrying a one-line wall-clock-contract justification; the helper lives at tests/lib/wait-for.ts and matches no `*.test.*` pattern.

## Verify
pnpm exec vitest run tests/async-computed.ts tests/async-errors.ts tests/async-hardening.ts tests/async-iterable.ts tests/async-nested.ts tests/effects.ts tests/errors.ts tests/invalidate.ts tests/reactive.ts tests/system.ts

## Notes
The relocation item that follows moves this helper (and all converted suites) into the `test/` tree — keep the helper's import specifier relative (`./lib/wait-for` from root suites) so the move stays mechanical.

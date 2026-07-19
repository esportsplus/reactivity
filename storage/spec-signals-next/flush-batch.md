---
api-impact: none
depends-on: [none]
files-own: [tests/flush.ts]
files-shared: [src/system.ts]
priority: P1
recommended-model: sonnet
status: PENDING
tests: [tests/flush.ts]
type: feature
validation: deterministic
---

# flush() sync escape hatch + minimal batch()

## Design

Solid 2.0 keeps default microtask batching and adds a sync `flush()` (S2 finding 10, S3 finding 15). Ours today has NO way to force a synchronous settle (stabilize is microtask-only — src/system.ts schedule() :259-271, stabilize :273-306). Both functions in src/system.ts, exported.

```ts
const flush = (): void => {
    if (stabilizer === STABILIZER_SCHEDULED) {
        stabilize();
    }
};
```

- SCHEDULED → run stabilize() synchronously now. The already-queued microtask later finds an IDLE stabilizer and an empty heap and no-ops through its loop (stabilize is idempotent over an empty heap; single-threaded, so no overlap is possible). stabilize() itself handles the RESCHEDULE tail, so writes-during-flush settle within the synchronous call chain.
- RUNNING / RESCHEDULE (flush called from inside an effect during stabilization) → no-op by design: the current pass already drains everything, and re-entering stabilize would corrupt heap_i. Document this at the definition.
- IDLE → nothing pending, no-op.

```ts
const batch = <T>(fn: () => T): T => {
    depth++;

    try {
        return fn();
    }
    finally {
        depth--;

        if (!depth) {
            schedule();
        }
    }
};
```

depth is the existing recompute-nesting counter schedule() already consults (`stabilizer === STABILIZER_IDLE && !depth`, :264) — batch() reuses it verbatim, so writes inside fn defer scheduling and one microtask (or an explicit flush()) settles the lot. `batch(fn); flush();` is the sync-transaction idiom; document it. No behavioral change for code not using batch — the default microtask batching already groups same-task writes.

## Rationale

The benchmark adapter, tests, and template's render scheduling all need a deterministic settle point; today the only option is awaiting microtasks. Evidence verdict: minimal batch/flushSync ADOPT (S3 finding 17).

## Changes

- src/system.ts: flush(), batch(), exports updated.
- tests/flush.ts: new.

## Acceptance

1. write → flush(): the dependent effect has run synchronously before flush() returns; a write inside that effect also settles before flush() returns (RESCHEDULE tail drained).
2. flush() inside a running effect is a safe no-op (no re-entrant stabilize, no heap corruption — subsequent propagation still completes).
3. batch(fn): multiple writes inside fn produce exactly one effect re-run after settle; batch returns fn's value; depth restores when fn throws.
4. The previously-queued microtask after a manual flush() causes no double effect runs.
5. 0 regressions in tests/flush.ts run scoped; `pnpm exec tsc --noEmit` green.

## Reads

- src/system.ts — schedule()/stabilize()/depth machinery (anchors above)
- tests/effects.ts — existing scheduling expectations that must hold unchanged

## Checks

- pnpm run test tests/flush.ts
- pnpm exec tsc --noEmit

## Verify

Acceptance clauses 1-4 are asserted in tests/flush.ts (Check 1); clause 5's type gate is Check 2 — 1:1 mapping. Optional follow-on noted for benchmark-harness: the adapter's withBatch may switch its microtask drain to `batch + flush` once this lands (not part of this item's scope).

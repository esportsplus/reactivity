---
api-impact: none
depends-on: [global-version-fast-path, async-computed-hardening]
files-own: [tests/invalidate.ts]
files-shared: [src/system.ts]
priority: P2
recommended-model: sonnet
status: PENDING
tests: [tests/invalidate.ts]
type: feature
validation: deterministic
---

# invalidate() — standalone re-derivation of any computed

## Design

Solid 2.0's refresh(x) adapted (S2 finding 6): force a computed to re-run WITHOUT the dummy-signal-dependency refetch hack. In src/system.ts, exported:

```ts
const invalidate = <T>(computed: Computed<T>): void => {
    let meta = asyncMeta.get(computed as Computed<unknown>);

    if (meta) {
        invalidate(meta.factory as Computed<T>);
        return;
    }

    writes++;
    computed.state |= STATE_DIRTY;
    insertIntoHeap(computed);
    schedule();
};
```

- `writes++` FIRST: defeats the global-version fast path (a gv-stamped node must not skip its forced re-run) — this is the cross-reference pinned in global-version-fast-path's Design.
- asyncMeta redirect: invalidating an asyncComputed WRAPPER re-runs the FACTORY, which re-dispatches the promise (a refetch) — invalidating the wrapper alone would just re-read the internal signals and change nothing. asyncMeta ships with `factory` precisely for this (async-computed-hardening Design 2).
- Ordinary computeds: DIRTY + heap + schedule reuses the exact write-path machinery; the re-run propagates onward only if the value actually changes (existing cut-off), or unconditionally re-executes side-effecting fns (effects) — both correct.
- No-op cases: a disposed computed re-inserts, recomputes with whatever deps relink — same semantics as any recompute; signals are rejected by the type (Computed only).

## Rationale

Removes the "write a dummy signal read by the computed, bump it to refetch" pattern; one function, all machinery existing.

## Changes

- src/system.ts: invalidate() + export.
- tests/invalidate.ts: new.

## Acceptance

1. invalidate(computed) re-runs its fn (run counter +1 after settle) even with no dependency change; dependents re-run only if the value changed.
2. invalidate(asyncComputedNode) re-dispatches the factory promise (fetch counter +1) and the new settlement lands via latest-wins.
3. An effect can be invalidate()d to force a re-run.
4. The global-version fast path does not swallow a forced re-run (invalidate immediately after a settled stabilize still re-runs).
5. 0 regressions in tests/invalidate.ts run scoped; `pnpm exec tsc --noEmit` green.

## Reads

- src/system.ts — insertIntoHeap/schedule/asyncMeta/writes as landed by prior items
- tests/async-hardening.ts — asyncMeta behavior this composes with

## Checks

- pnpm run test tests/invalidate.ts
- pnpm exec tsc --noEmit

## Verify

Acceptance 1-4 asserted in tests/invalidate.ts (Check 1); clause 5's type gate is Check 2 — 1:1 mapping, no judgment residue (all machinery reused, no new algorithm).

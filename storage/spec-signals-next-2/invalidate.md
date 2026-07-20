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

## Rationale

Removes the "write a dummy signal read by the computed, bump it to refetch" pattern; one function, all machinery existing (Solid 2.0's refresh(x) adapted — S2 finding 6). Re-authored from the predecessor: the implementation Design was fine — the block was a TEST defect (the landed tests/invalidate.ts imported STATE_EFFECT from ~/constants and mutated node state directly, the exact banned anti-pattern). This item embeds the full public-API-only test suite so the test surface is settled at spec time.

## Changes

- src/system.ts: `invalidate()` + export (alphabetical position in the export block).
- tests/invalidate.ts: new, authored verbatim from Design — public-API imports from ~/system ONLY.

## Design

Force a computed to re-run WITHOUT the dummy-signal-dependency refetch hack. In src/system.ts, exported:

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

- `writes++` FIRST: defeats the global-version fast path (a gv-stamped node must not skip its forced re-run — update()'s `computed.gv === w` early-exit at src/system.ts:463-467 would otherwise clear the notify mask without recomputing).
- asyncMeta redirect (src/system.ts:11): invalidating an asyncComputed WRAPPER re-runs the FACTORY, which re-dispatches the promise (a refetch) — invalidating the wrapper alone would just re-read the internal signals and change nothing. asyncMeta ships with `factory` precisely for this.
- Ordinary computeds: DIRTY + heap (insertIntoHeap :114-145) + schedule (:365-377) reuses the exact write-path machinery; the re-run propagates onward only if the value actually changes (existing cut-off), or unconditionally re-executes side-effecting fns — both correct.
- No-op cases: a disposed computed re-inserts, recomputes with whatever deps relink — same semantics as any recompute; signals are rejected by the type (Computed only).
- Export: add `invalidate` to the src/system.ts export statement in alphabetical position (after `flush`, before `isComputed`).

**Effect-invalidation surface (root cause of the predecessor block — pinned here so no implementer reinvents the banned hack)**: `effect()` returns a DISPOSER, never its node, so a true STATE_EFFECT node is unreachable from the public API. STATE_EFFECT alters only the error-rethrow arm — the invalidate machinery (DIRTY + heap + schedule + recompute) is byte-identical for any computed. The sanctioned public-API encoding of Acceptance 3 is therefore a SIDE-EFFECTING computed held observed by a keeper effect (test 4 below). Importing STATE_EFFECT from ~/constants or flipping `node.state` directly is BANNED — if a test needs internal state, the test is wrong.

**tests/invalidate.ts — authored deliverable.** Public-API-only: imports from `~/system` exclusively (no ~/constants, no node-state mutation, no root()/definite-assignment scaffolding). Land exactly these five tests:

```ts
import { describe, expect, it } from 'vitest';
import { asyncComputed, computed, effect, flush, invalidate, read, signal, write } from '~/system';


describe('invalidate()', () => {
    it('re-runs the computed fn with no dependency change', () => {
        let runs = 0,
            s = signal(1);

        let c = computed(() => {
            runs++;

            return read(s);
        });

        effect(() => {
            read(c);
        });

        expect(runs).toBe(1);

        invalidate(c);
        flush();

        expect(runs).toBe(2);
    });

    it('dependents re-run only when the forced re-run changes the value', () => {
        let changingRuns = 0,
            s = signal(1),
            stableRuns = 0,
            ticks = 0;

        let changing = computed(() => {
            read(s);

            return ++ticks;
        });

        let stable = computed(() => read(s));

        effect(() => {
            stableRuns++;
            read(stable);
        });

        effect(() => {
            changingRuns++;
            read(changing);
        });

        invalidate(stable);
        flush();

        expect(stableRuns).toBe(1);

        invalidate(changing);
        flush();

        expect(changingRuns).toBe(2);
    });

    it('re-dispatches an asyncComputed factory (refetch via the asyncMeta redirect)', async () => {
        let fetches = 0;

        let node = asyncComputed(() => {
            fetches++;

            return Promise.resolve(fetches);
        });

        let stop = effect(() => {
            read(node);
        });

        await new Promise((r) => setTimeout(r, 0));

        expect(fetches).toBe(1);
        expect(read(node)).toBe(1);

        invalidate(node);
        await new Promise((r) => setTimeout(r, 0));

        expect(fetches).toBe(2);
        expect(read(node)).toBe(2);

        stop();
    });

    it('forces a side-effecting computed (the public effect encoding) to re-run without propagating', () => {
        let keeperRuns = 0,
            s = signal(1),
            sideRuns = 0;

        let c = computed<void>(() => {
            read(s);
            sideRuns++;
        });

        effect(() => {
            keeperRuns++;
            read(c);
        });

        expect(sideRuns).toBe(1);
        expect(keeperRuns).toBe(1);

        invalidate(c);
        flush();

        expect(sideRuns).toBe(2);
        expect(keeperRuns).toBe(1);
    });

    it('the global-version fast path does not swallow a forced re-run', () => {
        let runs = 0,
            s = signal(1);

        let c = computed(() => {
            runs++;

            return read(s);
        });

        effect(() => {
            read(c);
        });

        write(s, 2);
        flush();

        expect(runs).toBe(2);

        // Fully settled: c carries the current gv stamp. Without writes++ inside
        // invalidate, this pull would exit through the fast path and skip the re-run.
        invalidate(c);

        expect(read(c)).toBe(2);
        expect(runs).toBe(3);

        flush();

        expect(runs).toBe(3);
    });
});
```

## Reads

- src/system.ts — insertIntoHeap/schedule/asyncMeta/writes and the gv fast-path exit in update() (anchors above)
- tests/async-hardening.ts — asyncComputed patterns test 3 composes with
- tests/flush.ts — test-file conventions to mirror (flush-driven synchronous settles)

## Acceptance

1. invalidate(computed) re-runs its fn (run counter +1 after settle) even with no dependency change; dependents re-run only if the value changed.
2. invalidate(asyncComputedNode) re-dispatches the factory (fetch counter +1) and the new settlement lands via latest-wins.
3. A side-effecting computed held observed by a keeper effect — the public-API encoding of an effect — can be invalidate()d to force a re-run (no STATE_EFFECT import, no node-state mutation).
4. The global-version fast path does not swallow a forced re-run (invalidate immediately after a settled stabilize still re-runs, including via the synchronous pull path).
5. tests/invalidate.ts EXISTS on disk with the five Design tests, imports from ~/system only, and 0 regressions run scoped; `pnpm exec tsc --noEmit` green.

## Checks

- pnpm run test tests/invalidate.ts
- pnpm exec tsc --noEmit

## Verify

Acceptance 1-4 asserted 1:1 in the five Design tests (Check 1); clause 5's type gate is Check 2 — no judgment residue (all machinery reused, no new algorithm). Grep-level self-check before handoff: tests/invalidate.ts contains no `~/constants` import and no `.state` access.

## Notes

Re-authored from storage/spec-signals-next invalidate (BLOCKED: implementation fine; the landed test file imported STATE_EFFECT from ~/constants and flipped node state directly — the exact anti-pattern the replan banned). Discharge of the source item happens via `finalize-directory --migrated-to`. The full test suite is spelled in Design so the public-API-only constraint is enforced by the spec text itself.

---
api-impact: none
depends-on: [computed-error-caching, signal-is-selector]
files-own: [tests/equals.ts]
files-shared: [src/system.ts, src/types.ts]
priority: P1
recommended-model: sonnet
status: PENDING
tests: [tests/equals.ts]
type: feature
validation: deterministic
---

# Custom equals on signal() and computed()

## Rationale

`===`-only forces NaN-carrying and tuple-shaped values to over-propagate; every surveyed library (preact, Solid, TC39, alien — S3 finding 6) exposes equals. Two null-checks, zero cost when unused. Re-authored from the predecessor: the src diff was critic-verified CORRECT there — the only failure was that tests/equals.ts never landed, so the scoped gate returned "No test files found". This item makes the test file an explicitly authored deliverable: its full contents are spelled in Design and landing it is half the work.

## Changes

- Signal/Computed node shape: an `equals` comparator field, null by default.
- Write gate and computed-propagation gate: comparator-aware equality with the default `===` path untouched.
- New scoped suite tests/equals.ts (authored verbatim from Design).

## Design

One optional comparator at the two existing equality gates (S3 finding 6; TC39-aligned). Default stays `===` (settled — Answered Q3: NaN re-triggering under `===` is documented, Object.is is opt-in via this parameter). Preserve this implementation shape exactly — it already passed static critic verification in the predecessor run.

**Shape**: optional trailing positional arg — `signal<T>(value, equals?: (a: T, b: T) => boolean)` and `computed<T>(fn, equals?: (a: T, b: T) => boolean)`. Pre-declare `equals: null` on ALL THREE node literals for hidden-class stability: the signal factory literal (src/system.ts:785-795), the computed factory literal (:559-575), and the signal.is selector-entry literal (:808-819 — SelectorSignal entries must keep the superset shape). An explicitly-passed `undefined` normalizes to null at the factory (`equals ?? null`). src/types.ts: `equals: ((a: T, b: T) => boolean) | null` on both `Signal<T>` and `Computed<T>` (alphabetical field placement). `effect()` takes no comparator — effect nodes get `equals: null` through the computed factory default.

**Gates**:

- write() (src/system.ts:837-876): replace the `prev === value` early-return (:839-841) with `if (signal.equals === null ? prev === value : signal.equals(prev, value)) return;` — one monomorphic null-check on the fast path, comparator untouched for the default case. An equals-suppressed write stores NOTHING (same early-return the default uses today — the signal keeps its previous value).
- recompute() ok-branch (src/system.ts:342-349): compute `changed` via the gate BEFORE assignment, assign `computed.value` UNCONDITIONALLY (the cached value always updates — Acceptance 2), and propagate on `changed || hadError` — the error-recovery leg is never suppressed by a comparator:

```ts
if (ok) {
    computed.error = null;

    let changed = computed.equals === null
        ? value !== computed.value
        : !computed.equals(computed.value as T, value as T);

    computed.value = value as T;

    if (changed || hadError) {
        propagate(computed);
    }
}
```

**Comparator tracking pins**: at write() the comparator runs untracked by construction (write is not a tracking context). At recompute() the comparator runs after `observer` is restored (:320 — the current statement order already places the ok-branch after the restore); pin that ordering so a comparator reading signals cannot self-subscribe.

**tests/equals.ts — authored deliverable.** Land exactly these five tests (adjust only if compilation requires):

```ts
import { describe, expect, it } from 'vitest';
import { computed, effect, flush, peek, read, signal, write } from '~/system';


describe('custom equals', () => {
    it('a signal with an always-true comparator never propagates (and never stores)', () => {
        let runs = 0,
            s = signal(0, () => true);

        effect(() => {
            runs++;
            read(s);
        });

        expect(runs).toBe(1);

        write(s, 1);
        flush();

        expect(runs).toBe(1);
        expect(peek(s)).toBe(0);
    });

    it('Object.is suppresses a NaN re-write; the default === re-triggers on NaN', () => {
        let defaultRuns = 0,
            isRuns = 0,
            sDefault = signal(NaN),
            sIs = signal(NaN, Object.is);

        effect(() => {
            isRuns++;
            read(sIs);
        });

        effect(() => {
            defaultRuns++;
            read(sDefault);
        });

        write(sIs, NaN);
        flush();

        expect(isRuns).toBe(1);

        write(sDefault, NaN);
        flush();

        expect(defaultRuns).toBe(2);
    });

    it('a computed custom equals suppresses propagation while the cached value still updates', () => {
        let cRuns = 0,
            effectRuns = 0,
            s = signal(1);

        let c = computed(() => {
            cRuns++;

            return { parity: read(s) % 2, tick: cRuns };
        }, (a, b) => a.parity === b.parity);

        effect(() => {
            effectRuns++;
            read(c);
        });

        expect(cRuns).toBe(1);
        expect(effectRuns).toBe(1);

        write(s, 3);
        flush();

        expect(cRuns).toBe(2);
        expect(effectRuns).toBe(1);
        expect(peek(c).tick).toBe(2);

        write(s, 2);
        flush();

        expect(effectRuns).toBe(2);
        expect(peek(c).parity).toBe(0);
    });

    it('error recovery propagates under an always-true comparator (the hadError leg wins)', () => {
        let log: number[] = [],
            s = signal(0);

        let c = computed(() => {
            if (read(s) === 1) {
                throw new Error('equals boom');
            }

            return 0;
        }, () => true);

        let d = computed(() => {
            try {
                return read(c);
            }
            catch {
                return -1;
            }
        });

        effect(() => {
            log.push(read(d));
        });

        expect(log).toEqual([0]);

        write(s, 1);
        flush();

        expect(log).toEqual([0, -1]);
        expect(() => read(c)).toThrow('equals boom');

        write(s, 0);
        flush();

        expect(log).toEqual([0, -1, 0]);
    });

    it('the default path is byte-identical: no comparator gates with ===', () => {
        let runs = 0,
            s = signal(1);

        effect(() => {
            runs++;
            read(s);
        });

        write(s, 1);
        flush();

        expect(runs).toBe(1);

        write(s, 2);
        flush();

        expect(runs).toBe(2);
    });
});
```

## Reads

- src/system.ts — write()/recompute() gate sites + the three node literals (anchors above)
- src/types.ts — Signal/Computed shapes being extended
- tests/primitives.ts — default `===` gate expectations that must hold unchanged
- tests/untrack.ts — test-file conventions to mirror (public-API imports from ~/system only)

## Acceptance

1. A signal with `equals: () => true` never propagates; with Object.is, writing NaN over NaN does NOT re-run effects (and does re-run under the default `===`).
2. A computed with a custom equals suppresses propagation when the comparator deems values equal, and its own cached value updates regardless (read returns the latest computed value).
3. Default-path behavior is byte-identical: no comparator → `===` gates exactly as before (existing scoped suites pass).
4. Error recovery still propagates under a comparator that always returns true (the hadError leg wins).
5. tests/equals.ts EXISTS on disk with the five Design tests and 0 regressions run scoped; `pnpm exec tsc --noEmit` green.

## Checks

- pnpm run test tests/equals.ts
- pnpm exec tsc --noEmit

## Verify

Acceptance clauses 1-4 are asserted 1:1 by the five Design tests (Check 1 — which also fails loud if tests/equals.ts is missing, the exact predecessor defect); clause 5's type gate is Check 2. Default-path regressions are engine-gated via the `tests` field scoped run.

## Notes

Re-authored from storage/spec-signals-next custom-equals (BLOCKED: implementation critic-verified correct, but tests/equals.ts never landed → scoped gate "No test files found, exit 1"). Discharge of the source item happens via `finalize-directory --migrated-to` once this spec's run completes. The test file is spelled verbatim in Design precisely so it cannot be skipped again.

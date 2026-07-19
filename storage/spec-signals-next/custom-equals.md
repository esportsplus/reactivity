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

## Design

One optional comparator at the two existing equality gates (S3 finding 6; TC39-aligned). Default stays `===` (Clarifying Question 3 default — NaN re-triggering under `===` is documented, Object.is is opt-in via this parameter).

**Shape**: optional trailing positional arg — `signal<T>(value, equals?: (a: T, b: T) => boolean)` and `computed<T>(fn, equals?: (a: T, b: T) => boolean)`. Pre-declared `equals: null` field on BOTH node literals (signal factory src/system.ts:539-546, computed factory :378-391) for hidden-class stability; signal-is-selector's SelectorSignal entry literal gains `equals: null` too (it must keep the superset shape — coordinate with the landed literal). src/types.ts: `equals: ((a: T, b: T) => boolean) | null` on Signal and Computed.

**Gates**:
- write() (src/system.ts:548-566, as reshaped by signal-is-selector): replace the `signal.value === value` early-return with `if (signal.equals === null ? prev === value : signal.equals(prev, value)) return;` — one monomorphic null-check on the fast path, comparator untouched for the default case.
- recompute() cut-off (src/system.ts:241, as reshaped by computed-error-caching): the propagation condition's `value !== computed.value` leg becomes `(computed.equals === null ? value !== computed.value : !computed.equals(computed.value, value))` — the error-recovery (`hadError`) leg is unaffected: a comparator never suppresses error-state transitions.

An `undefined` passed explicitly normalizes to null at the factory. The comparator runs UNTRACKED by construction at write() (no observer manipulation needed — write is not a tracking context); at recompute() the comparator runs after `observer` is restored (:221) — pin that ordering so a comparator reading signals cannot self-subscribe.

## Rationale

`===`-only forces NaN-carrying and tuple-shaped values to over-propagate; every surveyed library (preact, Solid, TC39, alien) exposes equals. Two null-checks, zero cost when unused.

## Changes

- src/types.ts: equals field on Signal + Computed.
- src/system.ts: factory params + literals, the two gate changes.
- tests/equals.ts: new.

## Acceptance

1. A signal with `equals: () => true` never propagates; with Object.is, writing NaN over NaN does NOT re-run effects (and does re-run under the default `===`).
2. A computed with a custom equals suppresses propagation when the comparator deems values equal, and its own cached value updates regardless (read returns the latest computed value).
3. Default-path behavior is byte-identical: no comparator → `===` gates exactly as before (existing scoped suites pass).
4. Error recovery still propagates under a comparator that always returns true (the hadError leg wins).
5. 0 regressions in tests/equals.ts run scoped; `pnpm exec tsc --noEmit` green.

## Reads

- src/system.ts — write()/recompute() gate sites (anchors above)
- src/types.ts — node shapes being extended
- tests/primitives.ts — default `===` gate expectations that must hold unchanged

## Checks

- pnpm run test tests/equals.ts
- pnpm exec tsc --noEmit

## Verify

Acceptance clauses 1-4 are asserted in tests/equals.ts (Check 1); clause 5's type gate is Check 2 — 1:1 mapping; default-path regressions are engine-gated via the `tests` field scoped run.

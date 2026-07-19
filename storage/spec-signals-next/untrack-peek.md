---
api-impact: none
depends-on: [computed-error-caching]
files-own: [tests/untrack.ts]
files-shared: [src/system.ts]
priority: P1
recommended-model: sonnet
status: PENDING
tests: [tests/untrack.ts]
type: feature
validation: deterministic
---

# untrack() + peek()

## Design

Two missing-API adoptions (S3 finding 17; TC39-aligned semantics, S3 finding 5). Both in src/system.ts, added to the export list (:569-578); src/index.ts re-exports via the existing `export * from './system'`.

```ts
const untrack = <T>(fn: () => T): T => {
    let o = observer;

    observer = null;

    try {
        return fn();
    }
    finally {
        observer = o;
    }
};
```

try/finally is REQUIRED: with the error contract (computed-error-caching), reads inside fn may throw and the observer must be restored.

**peek(node)** returns the CURRENT value without subscribing — fresh, not stale: an untracked plain `read()` skips the update path entirely (src/system.ts:475-503 only pulls when `observer` is set), so `peek` cannot be just `untrack(() => read(node))`. Extract the pull block from read() — the notified-broadcast + update() sequence at :486-497 — into an internal `pull(node)` helper used by both read() and peek:

```ts
const peek = <T>(node: Signal<T> | Computed<T>): T => {
    if ((node as Computed<T>).state & STATE_COMPUTED) {
        pull(node as Computed<T>);
    }

    if ((node as Computed<T>).state & STATE_ERROR) {
        throw (node as Computed<T>).error;
    }

    return node.value;
};
```

pull() must run with `observer` nulled around its update() call (recompute inside update tracks into the node's OWN scope, not the caller's) — read() currently gets this for free because link() happened before update; keep read()'s behavior byte-identical by extracting exactly its existing block (the `height >= heap_i || NOTIFY_MASK` gate stays inside read(); peek gates only on NOTIFY_MASK). Signals short-circuit (state undefined → 0).

## Rationale

untrack is table stakes for any consumer writing effects that read config signals without subscribing; peek is the non-subscribing fresh read the template compiler and tests need. Both are ~15 lines over existing machinery.

## Changes

- src/system.ts: untrack, peek, internal pull() extraction; exports updated.
- tests/untrack.ts: new.

## Acceptance

1. An effect reading a signal only inside untrack() does not re-run when that signal changes; values read inside untrack are current.
2. untrack restores the observer when fn throws (a subsequent read in the same effect still tracks).
3. peek(computed) returns the up-to-date value for a dirty computed without creating a subscription (writer effect count unchanged; dep count of the caller unchanged).
4. peek of an errored computed rethrows the cached error; peek(signal) returns the value.
5. 0 regressions in tests/untrack.ts run scoped; `pnpm exec tsc --noEmit` green.

## Reads

- src/system.ts — read()/update()/observer machinery being factored
- tests/system.ts — existing dynamic-dependency tests peek must not disturb

## Checks

- pnpm run test tests/untrack.ts
- pnpm exec tsc --noEmit

## Verify

Acceptance clauses 1-4 are all asserted inside tests/untrack.ts (Check 1); clause 5's type gate is Check 2 — 1:1 mapping, no judgment residue: the read()-extraction is gated by the scoped existing-suite run in the engine's per-item gate via the `tests` field.

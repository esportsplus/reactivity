---
api-impact: none
depends-on: [async-computed-hardening]
files-own: [tests/async-iterable.ts]
files-shared: [src/system.ts]
priority: P2
recommended-model: sonnet
status: PENDING
tests: [tests/async-iterable.ts]
type: feature
validation: deterministic
---

# AsyncIterable computeds + resolve()

## Design

Two small extensions over the settled async machinery (S2 findings 13-14).

**AsyncIterable support** in asyncComputed's polling effect (src/system.ts, as landed by async-error-propagation + hardening): after `let result = read(factory)`, branch — `isPromise(result)` → existing settle path; else if `result != null && typeof (result as any)[Symbol.asyncIterator] === 'function'` → drive it manually:

```ts
let it = (result as AsyncIterable<T>)[Symbol.asyncIterator]();

onCleanup(() => { it.return?.(); });   // registered INSIDE the effect fn — re-runs and disposal both close the iterator

let step = (r: IteratorResult<T>) => {
    if (id !== v || (factory.state & STATE_NOTIFY_MASK)) return;   // same latest-wins + dirty-gap guards
    if (!r.done) {
        write(error, undefined);
        write(node, r.value);
        it.next().then(step, fail);
    }
    else { write(pending, false); }
};

it.next().then(step, fail);   // fail = the existing rejection arm (+ pending clear)
```

Each yielded value flows through the SAME node/error/pending signals — every next() is one settle. pending stays true until done/rejection (documented: an infinite iterable reports pending forever; acceptable — it IS in flight). A plain (non-promise, non-iterable) return writes through synchronously as `write(node, result)` — asyncComputed already implicitly required a Promise; pin the sync-value fallback so mixed-return factories are defined behavior.

**resolve()** (test-suite value, ~15 lines) exported from src/system.ts:

```ts
const resolve = <T>(fn: () => T): Promise<T> => {
    return new Promise((res, rej) => {
        let stop = effect(() => {
            try {
                let value = fn();
                if (value === undefined || isPendingExpression) return;   // see pin below
                queueMicrotask(stop); res(value);
            }
            catch (e) { queueMicrotask(stop); rej(e); }
        });
    });
};
```

Pin the settle predicate precisely: resolve settles on the first effect run where fn() (a) does not throw and (b) returns a value for which every asyncComputed read inside fn is not pending. Without a NotReady sentinel (tier-2 explicitly skipped — S2 finding 4), (b) is approximated as: fn returning `undefined` means "not ready yet, keep waiting" — the documented contract (asyncComputed nodes hold undefined pre-first-settle, so `() => read(wrapper)` composes naturally); non-undefined resolves, a throw rejects. `stop` is deferred via microtask because effect() returns after the first synchronous run — inside that first run the disposer variable is not yet assigned.

## Rationale

AsyncIterable factories (websocket feeds, generators) reuse the entire settle/guard machinery for the cost of one branch; resolve() makes async tests linear (`await resolve(() => read(user))`).

## Changes

- src/system.ts: asyncComputed iterable branch + sync-value fallback; resolve() export.
- tests/async-iterable.ts: new.

## Acceptance

1. An async-generator factory: each yield lands in order as the node's value (effects observe every settle); the iterator's return() is called on disposal AND on factory re-run (dep change mid-iteration).
2. Latest-wins across iterables: a factory re-run abandons the previous iterator's pending step (no stale yield lands).
3. A rejecting iterator step surfaces via the error contract (read rethrows); isPending is true mid-iteration, false after done.
4. resolve(): resolves with the first non-undefined value of a tracked expression over an asyncComputed; rejects when the expression throws; the internal effect is disposed after settling (no further fn runs).
5. 0 regressions in tests/async-iterable.ts run scoped; `pnpm exec tsc --noEmit` green.

## Reads

- src/system.ts — asyncComputed as landed by the two async items (guards, pending, error signals)
- src/index.ts — isPromise re-export in use
- tests/async-hardening.ts — guard patterns being extended

## Checks

- pnpm run test tests/async-iterable.ts
- pnpm exec tsc --noEmit

## Verify

Acceptance 1-4 asserted in tests/async-iterable.ts (Check 1); clause 5's type gate is Check 2 — 1:1 mapping. The undefined-means-pending resolve contract is documented in the test file header.

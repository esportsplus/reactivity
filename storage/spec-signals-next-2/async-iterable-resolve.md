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

## Rationale

AsyncIterable factories (websocket feeds, generators) reuse the entire settle/guard machinery for the cost of one branch; resolve() makes async tests linear (`await resolve(() => read(user))`) — S2 findings 13-14. Re-authored from the predecessor: the AsyncIterable branch was fine; the block was resolve()'s DISPOSAL — the internal effect faulted on the unlink() auto-dispose cascade and the old broken disposal test was left in place. This authoring pins the disposal ordering and spells the correct disposal test verbatim.

## Changes

- src/system.ts: asyncComputed iterable branch + sync-value fallback; resolve() export with the settled-guard disposal ordering.
- tests/async-iterable.ts: new — the disposal test is authored verbatim in Design; the remaining tests are pinned scenario-by-scenario.

## Design

Two small extensions over the settled async machinery.

**AsyncIterable support** in asyncComputed's polling effect (src/system.ts:501-522): widen the fn type to `Computed<Promise<T> | AsyncIterable<T> | T>['fn']` (return type stays `Computed<T | undefined>`; api-impact none — a widening). Extract the existing rejection lambda (:515-520) into a named local `fail` shared by both arms. After `let result = read(factory)`, branch:

- `isPromise(result)` (import `isPromise` from '@esportsplus/utilities' alongside the existing `isObject` — it is the same helper src/index.ts:1 re-exports) → the existing `.then(settle, fail)` path, unchanged.
- else if `result != null && typeof (result as AsyncIterable<T>)[Symbol.asyncIterator] === 'function'` → drive it manually:

```ts
let it = (result as AsyncIterable<T>)[Symbol.asyncIterator]();

onCleanup(() => {
    it.return?.();
});   // registered INSIDE the effect fn — re-runs and disposal both close the iterator

let step = (r: IteratorResult<T>) => {
    if (id !== v || (factory.state & (STATE_IN_HEAP | STATE_NOTIFY_MASK))) {
        return;   // the SAME latest-wins + dirty-gap guard the promise arm uses (:509)
    }

    if (r.done) {
        write(pending, false);
    }
    else {
        write(error, undefined);
        write(node, r.value);
        it.next().then(step, fail);
    }
};

untrack(() => it.next()).then(step, fail);
```

  Tracking pin: an async generator's body runs synchronously up to its first await/yield INSIDE that first `next()` call — under the polling effect's observer. Wrap iterator acquisition + first `next()` in `untrack` so stray reads inside the generator body cannot link into the polling effect; dependencies belong in the factory fn body, read synchronously BEFORE returning the iterable (document this one line in the test file header). Subsequent `next()` calls run from `.then` callbacks where observer is already null.

  Each yielded value flows through the SAME node/error/pending signals — every next() is one settle. pending stays true until done/rejection (documented: an infinite iterable reports pending forever; acceptable — it IS in flight).

- else (plain non-promise, non-iterable value) → sync-value fallback: `write(error, undefined); write(node, result as T); write(pending, false);` — asyncComputed previously implicitly required a Promise; pin the fallback so mixed-return factories are defined behavior.

**resolve()** exported from src/system.ts (alphabetical export position after `read`):

```ts
const resolve = <T>(fn: () => T): Promise<T> => {
    return new Promise((res, rej) => {
        let settled = false,
            stop: VoidFunction | null = null;

        let finish = (run: VoidFunction) => {
            settled = true;
            run();

            queueMicrotask(() => {
                if (stop !== null) {
                    let s = stop;

                    stop = null;
                    s();
                }
            });
        };

        stop = effect(() => {
            if (settled) {
                return;
            }

            let value;

            try {
                value = fn();
            }
            catch (e) {
                finish(() => rej(e));
                return;
            }

            if (value !== undefined) {
                finish(() => res(value as T));
            }
        });
    });
};
```

Settle predicate (documented in the test file header): fn returning `undefined` means "not ready yet, keep waiting" (asyncComputed nodes hold undefined pre-first-settle, so `() => read(wrapper)` composes naturally); the first non-undefined value resolves; a throw rejects.

**Disposal-ordering pins (the predecessor's block, settled here)**:

1. `settled` guard at the top of the effect fn: after settle, propagations re-entering the internal effect no-op BEFORE touching fn — "no further fn runs" is the assertable contract, and it holds even in the gap before the stop microtask lands.
2. stop stays microtask-deferred: effect() returns only after the first synchronous run, so the disposer is unassignable mid-run; by microtask time the assignment has completed — for the sync-settle case (fn resolves on the very first run) this is the ONLY correct ordering.
3. Exactly-once: the microtask nulls `stop` before invoking it.
4. Cascade safety: dispose() is idempotent (deps, cleanup, and disposal are all null after the first teardown — src/system.ts:605-626), so the deferred stop() runs CLEANLY even when the tracked asyncComputed's last reader has already unlinked and auto-disposed the wrapper (wrapper dispose → wrapper.disposal → polling-effect dispose cascade) between settle and the microtask. No guard beyond the null-check is needed — assert this via the teardown sequence in the disposal test, which double-disposes through keeper + root without throwing.

**tests/async-iterable.ts — authored deliverable** (public-API imports from ~/system; `ReturnType<typeof asyncComputed<number>>` + `root()` teardown mirror tests/async-hardening.ts). Seven tests:

1. **Yields land in order; return() fires on re-run**: factory `() => { read(s); return feed(); }` where `feed` is an async generator gated on externally-resolved promises, with `finally { returned++; }`. Release gates one at a time asserting `read(node)` after each settle (values 1 then 2, in order); then `write(s, 2)` mid-iteration → factory re-runs → assert `returned === 1` (old iterator closed via onCleanup) and a fresh iterator dispatched.
2. **return() fires on disposal**: same shape inside `root((dispose) => ...)` with a keeper effect; stop keeper + dispose root mid-iteration → assert `returned === 1` and no further values land.
3. **Latest-wins across iterables**: after the re-run of test 1's shape, release the OLD generator's pending gate → assert the stale yield never lands (`read(node)` unchanged) — the `id !== v` guard.
4. **Rejection surfaces via the error contract**: a generator whose second step rejects (throw after first yield) → assert `read(node)` rethrows the error; `isPending(node)` was true mid-iteration and is false after the rejection settle.
5. **Done clears pending**: a two-yield generator run to completion → assert `isPending(node)` flips false only after done; values observed via an effect log in yield order.
6. **resolve() resolves and rejects**: `await resolve(() => read(node))` returns the first non-undefined settle of a promise-based asyncComputed; `resolve(() => { throw new Error('resolve boom'); })` rejects with that error.
7. **resolve() disposal — land this test verbatim** (the predecessor left the old broken version in place; this replaces it):

```ts
it('resolve() disposes its internal effect after settling — no further fn runs, teardown is clean', async () => {
    let fnRuns = 0,
        node!: ReturnType<typeof asyncComputed<number>>,
        resolvers: ((v: number) => void)[] = [],
        s = signal(1),
        stopRoot!: VoidFunction;

    root((dispose) => {
        stopRoot = dispose;

        node = asyncComputed(() => {
            read(s);

            return new Promise<number>((r) => {
                resolvers.push(r);
            });
        });
    });

    let keeper = effect(() => {
        read(node);
    });

    expect(resolvers.length).toBe(1);

    let p = resolve(() => {
        fnRuns++;

        return read(node);
    });

    expect(fnRuns).toBe(1);   // first run sees undefined → keeps waiting

    resolvers[0](7);
    await expect(p).resolves.toBe(7);

    let settleRuns = fnRuns;

    // A dependency change after settling re-dispatches the factory (keeper still
    // subscribes) but must NOT re-run resolve's fn — its internal effect is disposed.
    write(s, 2);
    await new Promise((r) => setTimeout(r, 0));

    expect(resolvers.length).toBe(2);
    expect(fnRuns).toBe(settleRuns);

    resolvers[1](9);
    await new Promise((r) => setTimeout(r, 0));

    expect(read(node)).toBe(9);
    expect(fnRuns).toBe(settleRuns);

    // Clean teardown: keeper then root — the auto-dispose cascade (wrapper →
    // disposal → polling effect) plus the root's second dispose must not throw.
    keeper();
    stopRoot();

    expect(resolvers.length).toBe(2);
});
```

## Reads

- src/system.ts — asyncComputed polling effect, guards, pending/error signals, dispose idempotence (anchors above)
- src/index.ts — isPromise re-export in use (line 1)
- tests/async-hardening.ts — guard patterns and root()/keeper conventions being extended

## Acceptance

1. An async-generator factory: each yield lands in order as the node's value (effects observe every settle); the iterator's return() is called on disposal AND on factory re-run (dep change mid-iteration).
2. Latest-wins across iterables: a factory re-run abandons the previous iterator's pending step (no stale yield lands).
3. A rejecting iterator step surfaces via the error contract (read rethrows); isPending is true mid-iteration, false after done.
4. resolve(): resolves with the first non-undefined value of a tracked expression over an asyncComputed; rejects when the expression throws; the internal effect is disposed after settling (no further fn runs) and the keeper/root teardown afterwards completes without throwing.
5. tests/async-iterable.ts EXISTS on disk with Design test 7 verbatim plus tests 1-6, and 0 regressions run scoped; `pnpm exec tsc --noEmit` green.

## Checks

- pnpm run test tests/async-iterable.ts
- pnpm exec tsc --noEmit

## Verify

Acceptance 1-4 asserted in tests/async-iterable.ts (Check 1); clause 5's type gate is Check 2 — 1:1 mapping. The undefined-means-pending resolve contract and the generator tracking pin are documented in the test file header. Self-check before handoff: the disposal test contains the keeper effect, the root dispose teardown, and the `expect(resolvers.length).toBe(2)` assertion — the three markers whose absence defined the predecessor's broken test.

## Notes

Re-authored from storage/spec-signals-next async-iterable-resolve (BLOCKED: the resolve() internal effect + disposal test threw on the unlink() auto-dispose cascade, and the old broken test — root() with no dispose arg, no keeper, no stopRoot(), no resolver-count assert — was left in place). Discharge via `finalize-directory --migrated-to`. The disposal ordering is now pinned in Design and the corrected test is spelled verbatim so it cannot regress into the old shape.

# Test Audit: @esportsplus/reactivity

**Date:** 2026-03-24
**Version:** 0.31.0

## Summary

| Metric | Count |
|--------|-------|
| Source modules | 10 |
| Test files | 9 |
| Benchmark files | 3 |
| Test cases | ~250 |
| Benchmarks | ~56 |
| Gaps found | 17 |

Overall coverage is **strong**. Core reactivity primitives (`signal`, `computed`, `effect`, `read`, `write`, `dispose`, `root`, `onCleanup`) and `ReactiveArray` have thorough test suites with edge cases, error paths, and stress tests. The main gaps are in compiler plugin functional testing, a few `ReactiveArray` behavioral edge cases, and `ReactiveObject` subclass patterns.

---

## Missing Tests (Priority Order)

| # | Module | Export / Area | Risk | Details |
|---|--------|--------------|------|---------|
| 1 | `reactive/array.ts` | `unshift()` with empty args | **HIGH** | `push()` guards against empty args (line 223: `if (!items.length) return`), but `unshift()` (line 311) has no guard — dispatches event with `{ items: [] }` and writes length even when nothing changes. Likely a bug; needs test to confirm and fix. |
| 2 | `compiler/plugins/tsc.ts` | TSC plugin functional behavior | **HIGH** | Only tested "is defined". No test that the plugin transforms source code correctly through the TypeScript compiler API. |
| 3 | `compiler/plugins/vite.ts` | Vite plugin functional behavior | **HIGH** | Only tested "is defined". No test for `transform` hook, `name`, or pattern matching. |
| 4 | `reactive/object.ts` | `[COMPUTED]` subclass override | **MEDIUM** | Only `[SIGNAL]` has a subclass test. No test for subclass creating computed fields via `[COMPUTED]()`. |
| 5 | `reactive/object.ts` | `[REACTIVE_ARRAY]` subclass override | **MEDIUM** | No test for subclass creating array fields via `[REACTIVE_ARRAY]()`. |
| 6 | `reactive/object.ts` | `dispose()` called twice | **MEDIUM** | No test for double-dispose idempotency. Code pops from `disposers` array so second call is safe, but no assertion. |
| 7 | `reactive/object.ts` | Empty object constructor | **MEDIUM** | No test for `new ReactiveObject({})` — empty object with no properties. |
| 8 | `reactive/array.ts` | `$set` creating sparse array | **MEDIUM** | `$set(100, value)` on empty array creates holes at indices 0-99. No test for sparse behavior or reactive length correctness with large gaps. |
| 9 | `reactive/array.ts` | `on()` trailing null cleanup | **MEDIUM** | `on()` has trailing null cleanup (line 198-200) separate from `dispatch()`. No test specifically exercises `on()` inserting into a slot while trailing nulls exist beyond the hole. |
| 10 | `system.ts` | `read` during stabilization (`notified` flag) | **MEDIUM** | `read()` has a `notified` flag path (line 487-495) that scans the entire heap and marks all as DIRTY. Only indirectly tested through propagation edge cases. |

---

## Shallow Tests

| # | Module | Export | Covered | Missing Edge Cases |
|---|--------|--------|---------|--------------------|
| 1 | `system.ts` | `asyncComputed` | happy path, race, abort, dispose, reject | Standalone `asyncComputed` chained with another `asyncComputed` (nested async deps) |
| 2 | `system.ts` | `computed` | creation, chaining, diamond, memoization | Computed depending on a disposed signal (should it throw? retain stale value?) |
| 3 | `system.ts` | `onCleanup` | recompute, dispose, multiple, outside observer | Cleanup function that throws (does it prevent other cleanups from running?) |
| 4 | `reactive/array.ts` | `sort()` | basic sort, duplicates | Sort stability verification with objects as elements (reference identity preserved?) |
| 5 | `reactive/array.ts` | `splice()` | remove, insert, replace | Splice with `start` beyond array length; splice with negative `start` |
| 6 | `compiler/*.ts` | All transforms | Individual transforms | Compound patterns: reactive inside loops, conditionals, destructuring, nested reactive() calls |

---

## Missing Benchmarks

| # | Module | Export | Reason |
|---|--------|--------|--------|
| 1 | `system.ts` | `asyncComputed` | Async resolution is a hot path in real apps; no benchmarks exist |
| 2 | `reactive/object.ts` | Object with async computed | `[COMPUTED]` async path allocates root + effect + promise chain per property |
| 3 | `system.ts` | `computed` deep chains | Bench only tests depth 5; tests cover depth 50+. Need benchmark for deep propagation perf |
| 4 | `system.ts` | `read` during stabilization | The `notified` flag path does a full heap scan — should be benchmarked |
| 5 | `reactive/array.ts` | `sort()` with large arrays | Sort tracks `before` positions + builds `Map` — O(n) memory; bench only tests 10/100 |

---

## Stale Tests

None detected. All test references match current exports and API surface.

---

## Potential Bug: `unshift()` Missing Empty Guard

```typescript
// push (line 222-233) — has guard:
push(...items: T[]) {
    if (!items.length) {
        return this.length;
    }
    // ...
}

// unshift (line 311-318) — NO guard:
unshift(...items: T[]) {
    let length = super.unshift(...items);
    write(this._length, length);        // writes even with no change
    this.dispatch('unshift', { items }); // dispatches { items: [] }
    return length;
}
```

`concat()` also guards empty (line 123: `if (added.length)`), making `unshift()` inconsistent.

---

## Recommendations

1. **Fix `unshift()` empty guard** — Add `if (!items.length) return this.length;` to match `push()`/`concat()` behavior. Add test confirming no-op.
2. **Add compiler plugin integration tests** — Even minimal tests that run a transform through the actual TSC/Vite plugin APIs would catch registration and pattern-matching issues.
3. **Add `ReactiveObject` subclass tests for `[COMPUTED]` and `[REACTIVE_ARRAY]`** — These are the extension points for the class; test that overriding them customizes object construction.
4. **Add double-dispose idempotency tests** — For both `ReactiveObject.dispose()` and `ReactiveArray.dispose()`.
5. **Benchmark async paths** — `asyncComputed` and object async computed properties are common in real usage but have zero perf baseline.
6. **Add `onCleanup` error resilience test** — Verify that if one cleanup throws, remaining cleanups still execute (currently they don't — `cleanup()` in system.ts iterates the array with no try/catch).

# Performance Audit & Feature Roadmap

**Library**: `@esportsplus/reactivity` v0.30.3
**Date**: March 2026
**Baseline**: 262/262 tests passing, build clean

---

## Table of Contents

1. [Alien Signals Comparison](#1-alien-signals-comparison)
2. [SolidJS 2.0 Insights](#2-solidjs-20-insights)
3. [Feature Roadmap](#3-feature-roadmap)
4. [Priority Matrix](#4-priority-matrix)

---

## 1. Alien Signals Comparison

### Architecture: `stackblitz/alien-signals` (v3.1.2, 4.9M+ weekly npm downloads)

| Feature | alien-signals | @esportsplus/reactivity | Gap |
|---------|-------------|----------------------|-----|
| Propagation | Iterative stack (no recursion) | Recursive `notify()` + `update()` | **Critical** |
| Scheduling | Simple array queue + batch depth | Heap-based topological sort | Different approach (ours is more sophisticated) |
| Link management | Dual-tail caching, O(1) operations | Same pattern (depsTail + subsTail) | Parity |
| Dep purging | Lazy (only unlink past depsTail) | Same pattern | Parity |
| State tracking | 6-flag bitmask | 5-flag bitmask | Parity |
| Link pooling | No explicit pool | Pool with 1000 cap | Ours is unique |
| Effect scoping | Parent-child tree via activeSub | scope + cleanup arrays | Similar |
| Async support | None (framework concern) | None | Parity |
| Bundle size | ~1KB | Larger (compiler + reactive layer) | Different scope |

### Key Techniques to Adopt

1. **Iterative propagation** (HIGH priority): Both `propagate()` and `checkDirty()` in alien-signals use explicit stacks. This is their #1 performance advantage and eliminates stack overflow risk.

2. **Combined propagation + scheduling pass**: alien-signals' `propagate()` sets flags AND queues effects in one traversal. Our system does `write() → insertIntoHeap() for each sub` then later `read() → notify() recursively`. Combining would eliminate double-traversal.

3. **`isValidLink()` check**: alien-signals validates link freshness bidirectionally during traversal, skipping branches not taken in the latest run. Our version check partially covers this.

---

## 2. SolidJS 2.0 Insights

### Status: v2.0.0-beta.0 (released ~March 2026)

SolidJS 2.0 is a ground-up rewrite of the reactive core, now published as `@solidjs/signals` as a standalone package.

### Key Reactive Features

| Feature | Description | Relevance to Us |
|---------|-------------|-----------------|
| **Async-first computations** | `createMemo(async () => ...)` — graph knows how to suspend/resume | **HIGH** — major feature gap |
| **Microtask batching** | All updates batch until microtask flush; reads don't update until batch flushes | We already do this |
| **`flush()`** | Explicit synchronous flush when needed | Could adopt |
| **Derived writable signals** | `createSignal(fn)` — derived + locally overridable | Novel pattern |
| **`createOptimistic`** | Optimistic state that reverts after async resolution | Framework-level feature |
| **`action()` + generators** | Async flow control with automatic scope tracking | Framework-level feature |
| **`<Loading>` (replaces Suspense)** | First-render fallback, then stable UI during refreshes | UI concern |
| **`isPending()`** | Expression-level pending detection | UI concern |
| **Split `createEffect`** | (compute → apply) separation for predictable execution | DX improvement |
| **Lazy memos** | Computed only on access | We do this already |
| **Automatic batching** | No manual `batch()` needed | We do this already |
| **`createProjection`** | Derived stores with reconciliation | Store-level feature |

### Scheduling Model

SolidJS 2.0 uses microtask batching where **writes are staged** — `setCount(1)` doesn't immediately update `count()`. The value updates only after `flush()`. This is controversial in the community but enables:
- Consistent reads during batch (no torn state)  
- Async composition through the graph
- Predictable effect execution

### Key Takeaway: Async Reactivity

The biggest lesson from SolidJS 2.0 is that **async is becoming first-class in reactive systems**. Their approach:
1. Computations can return Promises
2. Graph propagation pauses at async boundaries
3. `<Loading>` boundaries handle unresolved subtrees
4. Optimistic updates + revert patterns are built-in

This is the direction the ecosystem is moving. Alien-signals deliberately avoids it (staying ~1KB), but SolidJS embraces it fully.

---

## 3. Feature Roadmap

### 3.1 Performance Optimizations (No API Changes)

#### P1: Iterative Propagation (CRITICAL)

Replace recursive `notify()` and `update()` with explicit-stack iterative versions.

**Files**: `src/system.ts`
**Effort**: Medium
**Risk**: Low — behavior-preserving refactor
**Expected gain**: 10-30% on deep chains, eliminates stack overflow risk

#### P2: Combined Write + Notify Pass

Merge `write()`'s subscriber iteration with flag-setting into a single traversal. Currently:
1. `write()` inserts all subs into heap
2. `read()` (during stabilization) calls `notify()` on heap entries

Could instead: `write()` sets flags + inserts in one pass, eliminating the `notified` flag and heap scan in `read()`.

**Files**: `src/system.ts`
**Effort**: Medium-High
**Risk**: Medium — changes stabilization semantics
**Expected gain**: Eliminates O(heap_n) scan in `read()`, improves wide fan-out

#### P3: Reduce Computed Object Size

Encode `type` in `state` bitmask. Move `nextHeap`/`prevHeap` to external structure.

**Files**: `src/types.ts`, `src/system.ts`
**Effort**: Medium
**Risk**: Low
**Expected gain**: ~20% memory reduction per computed node

#### P4: Adaptive Link Pool

Remove hard cap or make it configurable. Consider high-water mark with periodic shrinking.

**Files**: `src/system.ts`
**Effort**: Low
**Risk**: None
**Expected gain**: Marginal — reduces allocation pressure in large apps

---

### 3.2 New Features

#### F1: Async Computed / Async Reactivity (HIGH VALUE)

Allow computed functions to return Promises. When a computed returns a Promise:
- The node enters a "pending" state
- Downstream subscribers see the previous value OR a sentinel
- When the Promise resolves, the value updates and propagation continues
- Race conditions handled via version guards (we already have this pattern in `ReactiveObject`)

```typescript
let data = computed(async (onCleanup) => {
    let controller = new AbortController();
    onCleanup(() => controller.abort());
    let response = await fetch('/api/data', { signal: controller.signal });
    return response.json();
});
```

**Scope**: Core system change
**Effort**: High
**Dependencies**: Split-phase effect execution (F2)

#### F2: Split-Phase Effects

Separate dependency tracking from side-effect execution (SolidJS 2.0 pattern):

```typescript
effect(
    () => count() * 2,           // pure computation (tracked)
    (doubled) => el.textContent = doubled  // side effect (untracked)
);
```

**Benefits**:
- Side effect guaranteed to run exactly once per batch
- Pure phase can be re-run safely for async retry
- Better composition with async

**Scope**: API addition (non-breaking — existing single-arg `effect()` still works)
**Effort**: Medium

#### F3: `flush()` — Synchronous Stabilization

Expose a `flush()` function that synchronously runs the stabilization loop:

```typescript
let count = signal(0);
write(count, 1);
flush();       // stabilizes now instead of waiting for microtask
read(count);   // 1
```

**Use cases**: Testing, imperative code that needs immediate consistency
**Scope**: Simple — expose `stabilize()` with guards
**Effort**: Low

#### F4: `batch()` — Explicit Write Grouping

```typescript
batch(() => {
    write(a, 1);
    write(b, 2);
    write(c, 3);
}); // single stabilization pass
```

**Scope**: Depth counter management
**Effort**: Low — increment `depth` on enter, decrement + `schedule()` on exit

#### F5: Effect Scopes

Group effects for mass disposal:

```typescript
let scope = effectScope(() => {
    effect(() => { /* ... */ });
    effect(() => { /* ... */ });
    effect(() => { /* ... */ });
});

scope.dispose(); // disposes all three
```

**Status**: We partially have this via `root()`. Could formalize.
**Effort**: Low

#### F6: Custom Equality / Comparators

Allow custom equality functions on signals and computeds:

```typescript
let pos = signal({ x: 0, y: 0 }, { equals: (a, b) => a.x === b.x && a.y === b.y });
```

**Scope**: Add `equals` option to signal/computed factories
**Effort**: Low
**Benefit**: Prevents spurious updates for object values

#### F7: `untrack()` — Read Without Subscribing

```typescript
effect(() => {
    let a = read(countA);            // tracked
    let b = untrack(() => read(countB)); // NOT tracked
});
```

**Scope**: Set `observer = null` temporarily
**Effort**: Trivial

#### F8: Derived Writable Signals

Signal whose value is derived from a function but can be locally overridden:

```typescript
let derived = signal(() => read(base) * 2); // derived from base
write(derived, 10);                          // override locally
// when base changes, derived recomputes and override is lost
```

**Scope**: SolidJS 2.0 pattern — combines signal + computed
**Effort**: Medium

---

## 4. Priority Matrix

### Immediate (Next Release)

| ID | Item | Type | Effort | Impact |
|----|------|------|--------|--------|
| P1 | Iterative propagation | Perf | Medium | HIGH |
| F3 | `flush()` | Feature | Low | Medium |
| F4 | `batch()` | Feature | Low | Medium |
| F7 | `untrack()` | Feature | Trivial | Medium |

### Short-Term (1-2 Releases)

| ID | Item | Type | Effort | Impact |
|----|------|------|--------|--------|
| P2 | Combined write+notify | Perf | Medium-High | HIGH |
| P3 | Reduce computed size | Perf | Medium | Medium |
| F2 | Split-phase effects | Feature | Medium | Medium |
| F5 | Effect scopes | Feature | Low | Medium |
| F6 | Custom equality | Feature | Low | Medium |

### Medium-Term (Feature Release)

| ID | Item | Type | Effort | Impact |
|----|------|------|--------|--------|
| F1 | Async computed | Feature | High | HIGH |
| F8 | Derived writable signals | Feature | Medium | Medium |
| P4 | Adaptive link pool | Perf | Low | Low |

---

## Appendix: Benchmark Baseline

| Benchmark | ops/sec |
|-----------|---------|
| create signal | 21.8M |
| read signal | 19.3M |
| write signal (no subs) | 19.9M |
| write signal (1 sub) | 4.8M |
| computed create | 5.9M |
| read computed | 5.4M |
| effect create+dispose | 11.8M |
| effect w/1 signal | 7.2M |
| 1→1 propagation | 4.8M |
| deep chain 10 | 896K |
| deep chain 50 | 221K |
| wide fan-out 100 | 110K |
| ReactiveObject 5 props | 698K |
| ReactiveArray push 1 | 11.3M |

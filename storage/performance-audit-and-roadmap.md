# Performance Audit & Feature Roadmap

**Library**: `@esportsplus/reactivity` v0.30.3
**Date**: March 2026
**Baseline**: 262/262 tests passing, build clean

---

## Table of Contents

1. [SolidJS 2.0 Insights](#1-solidjs-20-insights)
2. [Feature Roadmap](#2-feature-roadmap)
3. [Priority Matrix](#3-priority-matrix)

---

## 1. SolidJS 2.0 Insights

### Status: v2.0.0-beta.0 (released ~March 2026)

SolidJS 2.0 is a ground-up rewrite of the reactive core, now published as `@solidjs/signals` as a standalone package.

### Key Reactive Features

| Feature | Description | Relevance to Us |
|---------|-------------|-----------------|
| **Async-first computations** | `createMemo(async () => ...)` — graph knows how to suspend/resume | **HIGH** — major feature gap |
| **`flush()`** | Explicit synchronous flush when needed | Could adopt |
| **Derived writable signals** | `createSignal(fn)` — derived + locally overridable | Novel pattern |
| **Split `createEffect`** | (compute → apply) separation for predictable execution | DX improvement |

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

## 2. Feature Roadmap

### 2.1 Performance Optimizations (No API Changes)

#### P1: Reduce Computed Object Size

Encode `type` in `state` bitmask. Move `nextHeap`/`prevHeap` to external structure.

**Files**: `src/types.ts`, `src/system.ts`
**Effort**: Medium
**Risk**: Low
**Expected gain**: ~20% memory reduction per computed node

#### P2: Adaptive Link Pool

Remove hard cap or make it configurable. Consider high-water mark with periodic shrinking.

**Files**: `src/system.ts`
**Effort**: Low
**Risk**: None
**Expected gain**: Marginal — reduces allocation pressure in large apps

---

### 2.2 New Features

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
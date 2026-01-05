# Reactivity Transformer Optimization Audit

**Date**: 2026-01-05
**Scope**: `src/transformer/` + `src/system.ts` + `src/reactive/`
**Status**: UPDATED after namespace import refactoring

## Completed Optimizations

The following were addressed via namespace import refactoring (-88 LOC):

- **utilities.ts**: Replaced 32-line `addMissingImports` with 4-line `addNamespaceImport`
- **Removed neededImports tracking**: No longer track individual imports
- **Removed EXTRA_IMPORTS**: No special handling for constants/ReactiveArray modules
- **Fixed redundant getStart() calls**: primitives.ts now caches `argStart`
- **Compound operator map**: Replaced if-else chain with `Map<ts.SyntaxKind, string>` (-35 LOC)
- **Transform pipeline helper**: Refactored to loop over transforms array (-10 LOC)

---

## Remaining Findings

### HIGH PRIORITY

#### 1. Duplicate Import Detection (~16 LOC)

**Files**:
- [detector.ts:19-35](../src/transformer/detector.ts#L19-L35)
- [object.ts:103-122](../src/transformer/transforms/object.ts#L103-L122)
- [primitives.ts:217-233](../src/transformer/transforms/primitives.ts#L217-L233)

Three near-identical implementations checking for `reactive` import:

```typescript
if (ts.isNamedImports(clause.namedBindings)) {
    for (let i = 0, n = elements.length; i < n; i++) {
        if (elements[i].name.text === 'reactive') {
            ctx.hasReactiveImport = true;
            break;
        }
    }
}
```

**Optimization**: Extract to shared utility in `utilities.ts`.

**Impact**: -16 LOC, single source of truth

---

### MEDIUM PRIORITY

#### 2. Duplicate Listener Cleanup in ReactiveArray (~6 LOC)

**File**: [reactive/array.ts:144-146, 185-187](../src/reactive/array.ts#L144-L146)

Identical trailing-null cleanup in `dispatch()` and `on()`:

```typescript
while (listeners.length && listeners[listeners.length - 1] === null) {
    listeners.pop();
}
```

**Optimization**: Extract to private method `cleanupListeners()`.

**Impact**: -3 LOC, DRY principle

---

#### 3. Property Path Utilities Can Be Shared (~15 LOC)

**Files**:
- [transforms/array.ts:13-40](../src/transformer/transforms/array.ts#L13-L40) (`getExpressionName`, `getPropertyPath`)
- [transforms/primitives.ts](../src/transformer/transforms/primitives.ts) (similar traversal logic)

**Optimization**: Move to `utilities.ts` for reuse.

**Impact**: -15 LOC across transforms

---

## Updated LOC Reduction Summary

| Category | Location | Savings |
|----------|----------|---------|
| Shared import detection | detector/object/primitives | 16 |
| Property path utilities | transforms/array.ts | 15 |
| ReactiveArray helpers | reactive/array.ts | 11 |
| Plugin simplification | tsc.ts, vite.ts | 5 |
| State check patterns | system.ts | 6 |
| **TOTAL** | - | **~53 LOC** |

---

## Performance Optimizations (Remaining)

### Compilation Performance

1. **getText() caching**: Store extracted text in local variables when used multiple times

### Runtime Performance (ReactiveArray)

1. **sort() optimization**: Current implementation uses 3 Maps/Arrays for tracking
2. **Listener cleanup consolidation**: Reduce duplicate cleanup logic

---

## Next Steps

To implement remaining findings:
- "Extract shared import detection utility"
- "Extract property path utilities"

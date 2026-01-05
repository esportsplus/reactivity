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

---

## Remaining Findings

### HIGH PRIORITY

#### 1. Verbose Compound Operator Mapping (~35 LOC)

**File**: [primitives.ts:79-128](src/transformer/transforms/primitives.ts#L79-L128)

50-line if-else chain for operator kind to string mapping:

```typescript
// Current: 50 lines
function getCompoundOperator(kind: ts.SyntaxKind): string {
    if (kind === ts.SyntaxKind.PlusEqualsToken) return '+';
    else if (kind === ts.SyntaxKind.MinusEqualsToken) return '-';
    // ... 19 more branches
}
```

**Optimization**:
```typescript
const COMPOUND_OPS: Record<ts.SyntaxKind, string> = {
    [ts.SyntaxKind.PlusEqualsToken]: '+',
    [ts.SyntaxKind.MinusEqualsToken]: '-',
    // ... all operators
};

const getCompoundOperator = (kind: ts.SyntaxKind): string => COMPOUND_OPS[kind] ?? '+';
```

**Impact**: -35 LOC, O(1) lookup instead of O(n) branch prediction

---

#### 2. Duplicate Import Detection (~16 LOC)

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

#### 3. Transform Pipeline Helper (~10 LOC)

**File**: [index.ts:33-51](src/transformer/index.ts#L33-L51)

Three identical blocks with re-parse after each transform:

```typescript
result = transformReactiveObjects(current, bindings, ns);
if (result !== code) {
    current = ts.createSourceFile(...);
    code = result;
}
// Repeated 3x
```

**Optimization**: Extract helper function or consider single-pass replacement collection.

**Impact**: -10 LOC, cleaner code

---

### MEDIUM PRIORITY

#### 4. Duplicate Listener Cleanup in ReactiveArray (~6 LOC)

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

#### 6. Property Path Utilities Can Be Shared (~15 LOC)

**Files**:
- [transforms/array.ts:13-40](../src/transformer/transforms/array.ts#L13-L40) (`getExpressionName`, `getPropertyPath`)
- [transforms/primitives.ts](../src/transformer/transforms/primitives.ts) (similar traversal logic)

**Optimization**: Move to `utilities.ts` for reuse.

**Impact**: -15 LOC across transforms

---

### LOW PRIORITY

#### 7. Plugin tsc.ts Over-Wrapping (~3 LOC)

**File**: [plugins/tsc.ts](src/transformer/plugins/tsc.ts)

```typescript
// Current
export default (_program: ts.Program): ts.TransformerFactory<ts.SourceFile> => {
    return createTransformer();
};

// Better
export default (_program: ts.Program) => createTransformer();
```

**Impact**: -3 LOC

---

#### 8. Vite Plugin Guard Consolidation (~2 LOC)

**File**: [plugins/vite.ts:13-18](src/transformer/plugins/vite.ts#L13-L18)

```typescript
// Current: separate returns
if (!TRANSFORM_PATTERN.test(id) || id.includes('node_modules')) return null;
if (!mightNeedTransform(code)) return null;

// Better: single guard
if (!TRANSFORM_PATTERN.test(id) || id.includes('node_modules') || !mightNeedTransform(code)) {
    return null;
}
```

**Impact**: -2 LOC

---

#### 9. State Bit Check Pattern (~6 LOC)

**File**: [system.ts:53-56, 86-90](src/system.ts#L53-L56)

Similar patterns in `deleteFromHeap` and `insertIntoHeap`.

**Impact**: Minor clarity improvement

---

## Updated LOC Reduction Summary

| Category | Location | Savings |
|----------|----------|---------|
| Compound operator map | primitives.ts:79-128 | 35 |
| Shared import detection | detector/object/primitives | 16 |
| Transform pipeline helper | index.ts:33-51 | 10 |
| Property path utilities | transforms/array.ts | 15 |
| ReactiveArray helpers | reactive/array.ts | 11 |
| Plugin simplification | tsc.ts, vite.ts | 5 |
| State check patterns | system.ts | 6 |
| **TOTAL** | - | **~98 LOC** |

---

## Performance Optimizations (Remaining)

### Compilation Performance

1. **Map-based operator lookup**: O(1) instead of O(23) comparisons
2. **getText() caching**: Store extracted text in local variables when used multiple times

### Runtime Performance (ReactiveArray)

1. **sort() optimization**: Current implementation uses 3 Maps/Arrays for tracking
2. **Listener cleanup consolidation**: Reduce duplicate cleanup logic

---

## Next Steps

To implement remaining findings:
- "Implement compound operator map"
- "Extract shared import detection utility"
- "Extract transform pipeline helper"

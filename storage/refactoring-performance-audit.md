# Performance Audit Report: src/refactoring

## Executive Summary
- **Critical**: Compiler creates 4 SourceFile parses per file (4x overhead)
- **High**: Unused `ts.Program` parameter - full program created but never used
- **Medium**: Runtime allocations in hot paths (onCleanup, sort, concat)

## Findings

### Category 1: Compile-Time - Redundant SourceFile Parsing

| File | Line | Issue | Severity |
|------|------|-------|----------|
| core/index.ts | 14 | Creates sourceFile from code | critical |
| core/transforms/reactive-object.ts | 167 | Creates another sourceFile from same code | critical |
| core/transforms/reactive-array.ts | 61 | Creates another sourceFile from same code | critical |
| core/transforms/auto-dispose.ts | 149 | Creates another sourceFile from same code | critical |

**Impact**: 4x parsing overhead per transformed file. Each `ts.createSourceFile` is expensive.

**Fix**: Pass single sourceFile through transform pipeline instead of re-parsing.

### Category 2: Compile-Time - Unused Program Parameter

| File | Line | Issue | Severity |
|------|------|-------|----------|
| core/index.ts | 11 | `_program: ts.Program` parameter unused | high |
| plugins/vite.ts | 17-26 | Creates full Program on first transform | high |
| core/program.ts | 5-28 | Reads tsconfig, parses all project files | high |

**Impact**: Creating `ts.Program` parses ALL project files. This is never used in transforms.

**Fix**: Remove Program creation entirely, or make it lazy/optional only when type info needed.

### Category 3: Compile-Time - Multiple AST Traversals

| File | Line | Issue | Severity |
|------|------|-------|----------|
| core/transforms/reactive-object.ts | 171-186 | First pass: find imports | medium |
| core/transforms/reactive-object.ts | 195-265 | Second pass: find calls | medium |
| core/transforms/reactive-array.ts | 65-93 | First pass: collectBindings | medium |
| core/transforms/reactive-array.ts | 97-136 | Second pass: findReplacements | medium |

**Impact**: 2x AST traversal per transform (6 total traversals per file).

**Fix**: Combine into single visitor per transform.

### Category 4: Compile-Time - String Operations

| File | Line | Issue | Severity |
|------|------|-------|----------|
| core/transforms/reactive-object.ts | 282-284 | Multiple substring per replacement | low |
| core/transforms/reactive-array.ts | 151 | Multiple substring per replacement | low |
| core/transforms/reactive-object.ts | 106-107 | Regex created every call | low |

**Fix**: Use MagicString or single-pass offset tracking.

### Category 5: Runtime - Allocation in Hot Paths

| File | Line | Issue | Severity |
|------|------|-------|----------|
| system.ts | 450 | `[cleanup, fn]` array allocation in onCleanup | medium |
| system.ts | 453 | `cleanup.push(fn)` potential realloc | low |
| reactive/array.ts | 93 | `added: T[] = []` allocated even when empty | low |
| reactive/array.ts | 245 | `new Array(this.length)` in sort | low |
| reactive/array.ts | 253-254 | `new Map()` x2 in sort | medium |

**Impact**: onCleanup is called frequently in effects. Sort allocates 3 objects.

### Category 6: Runtime - Missing Short-Circuits

| File | Line | Issue | Severity |
|------|------|-------|----------|
| reactive/array.ts | 70-82 | $set always dispatches even if value unchanged | medium |
| reactive/array.ts | 212-218 | push dispatches even for empty items array | low |

## Metrics
- Files scanned: 15
- Issues found: 18
- Estimated compile-time improvement: 60-70% (eliminating redundant parses)

## Recommended Actions

### Immediate (High Impact)

1. **Single SourceFile pass** - core/index.ts:14
   ```typescript
   // Pass sourceFile to all transforms instead of code string
   result = transformReactiveObjects(sourceFile, bindings);
   result = transformReactiveArrays(result.sourceFile, bindings);
   ```

2. **Remove unused Program** - plugins/vite.ts:17-26
   ```typescript
   // Delete getProgram(), createProgramFromTsConfig
   // Pass null or remove parameter entirely
   ```

3. **Combine AST passes** - reactive-object.ts, reactive-array.ts
   ```typescript
   // Single visitor that collects imports + calls + bindings + replacements
   ```

### Medium Priority

4. **onCleanup allocation** - system.ts:446-454
   ```typescript
   // Pre-allocate small array, or use linked list
   if (!cleanup) {
       parent.cleanup = fn;
   } else if (typeof cleanup === 'function') {
       parent.cleanup = [cleanup, fn]; // Could pool these
   }
   ```

5. **Sort optimization** - reactive/array.ts:244-287
   ```typescript
   // Reuse Map instances via module-level cache
   // Or use object literal for small arrays
   ```

6. **$set short-circuit** - reactive/array.ts:70-82
   ```typescript
   $set(i: number, value: T) {
       if (this[i] === value) return value; // Add early return
       // ...
   }
   ```

### Low Priority

7. Cache compiled regex in addMissingImports
8. Use MagicString for string replacements
9. Pool event dispatch objects

## Next Steps

To implement, ask:
- "Implement finding #1" (single SourceFile pass)
- "Implement finding #2" (remove unused Program)
- "Fix compile-time issues"
- "Fix runtime allocations"

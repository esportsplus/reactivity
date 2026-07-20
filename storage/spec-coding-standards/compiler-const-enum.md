---
type: refactor
recommended-model: sonnet
status: PENDING
validation: deterministic
depends-on: none
api-impact: none
source: audit finding 3
files-own: [src/compiler/constants.ts]
tests: [tests/compiler.ts]
---

# Replace TYPES const enum with as-const object + union type

## Rationale
`const enum` is banned (erasable-syntax rule) and vitest/esbuild cannot inline cross-module const-enum members — a runtime-undefined risk on a hub file with 7 consumers. The `as const` object + union type is the sanctioned replacement.

## Changes
The compiler's TYPES discriminant keeps its exact numeric values and its dual value/type usage across all consumers; only the declaration form changes.

## Design
Exact recipe for src/compiler/constants.ts (lines 11-16):
1. Replace the `const enum TYPES { Array, Computed, Object, Signal }` declaration with:
   ```ts
   const TYPES = {
       Array: 0,
       Computed: 1,
       Object: 2,
       Signal: 3
   } as const;

   type TYPES = typeof TYPES[keyof typeof TYPES];
   ```
   Numeric values preserved exactly (Array=0, Computed=1, Object=2, Signal=3). The value declaration and the same-name type alias merge, so consumers using `TYPES.Array` (value position) and `type: TYPES` (type position — src/compiler/{array,object,primitives}.ts interfaces) both keep compiling unchanged.
2. Keep the declaration in its current position and the export list `export { ENTRYPOINT, ENTRYPOINT_REGEX, NAMESPACE, TYPES };` byte-identical — a named export of the merged declaration exports both the value and the type.
3. Touch nothing else; the 7 consumer files need zero edits.

## Acceptance
`tsc --noEmit` green; 0 regressions in tests/compiler.ts, run scoped; no `const enum` remains in src/.

## Checks
- node -e "const s=require('fs').readFileSync('src/compiler/constants.ts','utf8');process.exit(s.includes('const enum')?1:0)"
- node -e "const s=require('fs').readFileSync('src/compiler/constants.ts','utf8');process.exit(s.includes('} as const;')&&s.includes('type TYPES = typeof TYPES[keyof typeof TYPES];')?0:1)"
- node -e "const s=require('fs').readFileSync('src/compiler/constants.ts','utf8');process.exit(/Array: 0[\s\S]*Computed: 1[\s\S]*Object: 2[\s\S]*Signal: 3/.test(s)?0:1)"
- pnpm exec tsc --noEmit
- pnpm exec vitest run tests/compiler.ts

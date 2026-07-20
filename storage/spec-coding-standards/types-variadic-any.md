---
type: refactor
recommended-model: sonnet
status: PENDING
validation: deterministic
depends-on: none
api-impact: none
source: audit finding 1 (lower-confidence site, confirmed a violation)
files-own: [src/types.ts]
tests: [tests/reactive.ts]
---

# Replace variadic `any[]` function matcher in types.ts

## Rationale
Zero `any` is a hard rule. src/types.ts:38 uses `(...args: any[]) => infer R` as the "any function" matcher inside the `Reactive<T>` conditional type; `never[]` is the precise, any-free equivalent.

## Changes
The `Reactive<T>` mapped facade keeps identical matching semantics for function inputs; only the matcher's parameter bound changes.

## Design
Exact recipe:
1. src/types.ts:38 — change `T extends (...args: any[]) => infer R` to `T extends (...args: never[]) => infer R`.
2. Nothing else changes in the file.
Why `never[]`: in the `extends` position, function parameters check contravariantly — `never` is assignable to every parameter type, so `(...args: never[]) => infer R` matches every function signature exactly as `any[]` does, while `unknown[]` would stop matching functions with typed parameters (`unknown` is not assignable to a narrower parameter).

## Acceptance
`tsc --noEmit` green; 0 regressions in tests/reactive.ts, run scoped; no `any` token remains in src/types.ts.

## Checks
- node -e "const s=require('fs').readFileSync('src/types.ts','utf8');process.exit(/\bany\b/.test(s)?1:0)"
- node -e "const s=require('fs').readFileSync('src/types.ts','utf8');process.exit(s.includes('(...args: never[]) => infer R')?0:1)"
- pnpm exec tsc --noEmit
- pnpm exec vitest run tests/reactive.ts

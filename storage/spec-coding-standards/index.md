# @esportsplus/reactivity Coding Standards Spec

## Clarifying Questions

> Answer inline under each **A:**, then tell me you're done. Blocking questions gate the feature files
> they list; optional questions already have a sensible default applied — fill one in only to override.
> I'll apply your answers and move each answered question to the Answered log (I won't ask it again).

### Open — Optional
- **Q1** · test-relocation layout · affects: [relocate-test-suites, relocate-benchmarks] · assumed: subject-mirrored layout
  The suites are integration-style, so the mirror convention was resolved by each suite's dominant import subject: 18 suites importing only `~/system`/`~/types` (src root files) land at `test/<name>.test.ts`; the 4 suites whose subject is `src/reactive/*` (array, nested, objects, reactive) land at `test/reactive/<name>.test.ts`; compiler lands at `test/compiler/compiler.test.ts`. `effects.ts` imports ReactiveArray/ReactiveObject as fixtures but its subject is `effect()` from system — classified root. Alternative: a fully flat `test/<name>.test.ts` for all 23.
  **A:**
- **Q2** · dead build:test script · affects: [relocate-test-suites] · assumed: delete the script
  package.json `build:test` runs `vite build --config test/vite.config.ts` — that config has never existed, so the script cannot run today (dead code). Default is deletion during the test relocation; override to keep it (or to author the missing config) instead.
  **A:**
- **Q3** · lower-confidence `any` sites · affects: [types-variadic-any] · assumed: fix src/types.ts:38, leave src/compiler/object.ts:196
  src/types.ts:38 `(...args: any[])` IS a real violation and gets the precise `never[]` matcher fix. src/compiler/object.ts:196 `ReactiveObject<any>` lives inside a generated-code template STRING — it is emitted output text, not a type in this repo's type system, and tightening it changes the compiler's output contract for zero type-safety gain here — excluded as not-a-violation.
  **A:**

## Metadata
- **Generated**: 2026-07-20
- **Synthesizer**: claude-fable-5 · seat roles.synthesizer · router HARD
- **Research sources**: Mode 4 in-context coding-standards audit findings (11 findings, file:line anchored; no research files)
- **Threshold**: n/a (no perf items)
- **Total features**: 11
- **Model mix**: opus 7 · sonnet 4

## Features

### Batch 1
- system-any-casts
- types-variadic-any
- reactive-object-cleanup
- reactive-array-cleanup
- reactive-index-cleanup

### Batch 2
- compiler-const-enum
- compiler-import-order
- constants-export-order
- waitfor-test-helper

### Batch 3
- relocate-test-suites

### Batch 4
- relocate-benchmarks

## Feed
run,scope,unit,ordinal,slug,event,state,detail,elapsed_ms,ts

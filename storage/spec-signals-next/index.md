# Signals Next — @esportsplus/reactivity

## Metadata

- **Created**: 2026-07-19
- **Project**: d:/reactivity — @esportsplus/reactivity v0.31.3 (TypeScript strict, pnpm ONLY, vitest)
- **Synthesizer**: claude-fable-5 (seat roles.synthesizer, router verdict HARD)
- **Model mix**: opus 11 · sonnet 7
- **Items**: 18 (P0 5 · P1 6 · P2 7)
- **Deterministic-validation coverage**: 7/18 — residue on the other 11 is core hot-path fidelity judgment (hidden-class stability, monomorphism, bench semantics, ownership semantics), which resists a literal predicate
- **Sources**:
    - S1 — D:/reactivity repo exploration report (dispatch evidence; every anchor re-verified against source this session: src/system.ts, src/types.ts, src/constants.ts, src/reactive/{array,object,index}.ts, package.json, vitest.config.ts, tests/)
    - S2 — Solid 2.0 async research: https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/05-async-data.md · 01-reactivity-batching-effects.md · 04-stores.md · MIGRATION.md · packages/solid-signals/src/core/{async,error,heap,scheduler}.ts · boundaries.ts · https://github.com/solidjs/solid/discussions/2425 · /releases/tag/v2.0.0-beta.0
    - S3 — Signals state-of-the-art research: https://github.com/stackblitz/alien-signals (+ releases, src/system.ts) · vuejs/core#12349 · tc39/proposal-signals · milomg/reactively Reactive-algorithms.md · sveltejs/svelte#14945 · #15592 · preactjs.com/blog/signal-boosting/ · preact signals-core src · milomg/js-reactivity-benchmark · transitive-bullshit/js-reactivity-benchmark
    - S4 — User decisions (answered log, settled): signal.is() shape/lazy-setup/write-fan-out/unlink-eviction; lanes/transitions/optimistic, action(), createOptimistic, TC39 Signal.subtle, alien createReactiveSystem all OUT OF SCOPE
- **Ownership map**: C:/Users/ICJR/.claude/storage/runtime/d--reactivity/ownership.md — src/system.ts is THE hub and rides `files-shared` on every item that hooks into it; file-contention safety comes from that `files-shared` declaration (the engine welds shared-file items), NEVER from Depends-on. Every Depends-on edge names a REAL consumed artifact (a flag, field, helper, node shape, script, or test file the prerequisite creates); document order carries the residual risk ordering

## Baseline

- package.json has NO test/bench scripts — only build, build:test, prepare, prepublishOnly. `pnpm exec vitest run` and `pnpm exec tsc --noEmit` are the current manual gates.
- Tests: tests/*.ts (vitest include `tests/*.ts`); benches exist at tests/bench/{array,reactive-object,system}.ts (vitest benchmark include `tests/bench/**/*.ts`); `~` → src, `@esportsplus/reactivity` → src/index.ts (vitest.config.ts).
- src/system.ts (~580 lines, alien-signals-derived push-pull, height-bucketed heap): computed errors discarded in recompute (:213-218); asyncComputed swallows rejections (:372) and leaks outside root; cleanup() has no try/catch (:23-40); write() eagerly heap-inserts subs (:548-566); computeds auto-dispose on last-sub unlink (:325), signals deliberately skip it.
- Missing APIs: no untrack/peek, no flush/batch, no custom equals, no error channel, no invalidate.

## Public API Changes

- **computed-error-caching** (api-impact: breaking): a throwing computed no longer silently keeps its old value — the error is cached on the node and RETHROWN at read() until a dependency changes; an effect whose fn throws (and has no onError) rethrows out of a microtask instead of vanishing. tests/system.ts:845-924 expectations are updated by the item.
- **async-error-propagation** (api-impact: breaking): asyncComputed rejections are no longer swallowed — they rethrow at read() via the error contract. asyncComputed's return type changes from `Signal<T | undefined>` to `Computed<T | undefined>` (read() works identically; `isSignal(node)` on the returned node becomes false, `isComputed(node)` becomes true; writing to the returned node was never supported).

## Clarifying Questions

All three are OPTIONAL — the spec proceeds on the stated defaults; no item is blocked.

1. **is() callable shape** — default APPLIED: static `signal.is(node, key)` riding the signal factory (mirrors `root.disposables` and the user's `html.reactive` analogy; zero new export names). Alternative: a free-function `is()` export. Affects only the call shape template's compiler emits.
2. **Benchmark harness sourcing** — default APPLIED: port the canonical suites (kairo, cellx1000, molBench, dynamic graphs) as LOCAL vitest bench files behind a small adapter; no new dependency (dependency adds are Ask-First, and js-reactivity-benchmark's npm availability was not verifiable this run). Alternative: add milomg/js-reactivity-benchmark as a devDependency for cross-framework comparison.
3. **Default equality** — default APPLIED: keep `===` as the default write/recompute gate (NaN re-triggers; documented); Object.is or any other semantics are opt-in via the custom-equals item. Alternative: switch the default to Object.is (a behavior change for NaN/-0 writers).

## Features

### Batch 1

- test-bench-scripts
- benchmark-harness

### Batch 2

- signal-is-selector
- computed-error-caching
- async-error-propagation

### Batch 3

- untrack-peek
- flush-batch
- custom-equals
- async-computed-hardening

### Batch 4

- read-version-dedup
- global-version-fast-path

### Batch 5

- invalidate
- unobserved-hooks
- lazy-computeds
- cleanup-hardening
- recursion-free-walks
- async-iterable-resolve

### Batch 6

- pending-only-writes

## Feed

run,scope,unit,ordinal,slug,event,state,detail,elapsed_ms,ts
,item,mutator,,lazy-computeds,requeued,REQUEUED,,,2026-07-19T16:04:21-07:00
,item,mutator,0.0,lazy-computeds,reverted,REVERTED,"dropped from scope by user decision: lazy-by-default implemented + benchmarked (ABBA geomean 1.04, read-class 0.77-0.88, steady-read parity disproven), reverted per keep/revert rule; patch at ~/.claude/storage/lazy-bench/",,2026-07-19T16:05:15-07:00
,item,mutator,,lazy-computeds,requeued,REQUEUED,,,2026-07-19T16:23:22-07:00

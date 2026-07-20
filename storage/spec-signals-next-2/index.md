# Signals Next 2 — @esportsplus/reactivity (blocked-item supersession)

## Clarifying Questions

### Answered

- **Q1** · signal.is shape — settled: static `signal.is(node, key)` riding the signal factory; landed by the predecessor's signal-is-selector (src/system.ts:799-822).
- **Q3** · default equality — settled: `===` stays the default write/recompute gate (NaN re-triggers; documented); Object.is or any other semantics are opt-in via custom-equals.

## Metadata

- **Created**: 2026-07-19
- **Project**: d:/reactivity — @esportsplus/reactivity v0.31.3 (TypeScript strict, pnpm ONLY, vitest)
- **Supersedes**: storage/spec-signals-next (5 blocked items re-authored)
- **Synthesizer**: claude-fable-5 (seat roles.synthesizer, router verdict HARD)
- **Model mix**: opus 2 · sonnet 3
- **Items**: 5 (P1 1 · P2 4)
- **Deterministic-validation coverage**: 3/5 — residue: unobserved-hooks (callback-fires-after-teardown ordering is judgment), recursion-free-walks (traversal-order and teardown-order equivalence is judgment) — both resist a literal predicate
- **Sources**:
    - S1 — D:/reactivity repo exploration report (dispatch evidence; every anchor re-verified against source this session: src/system.ts, src/types.ts, src/constants.ts, src/reactive/{array,object,index}.ts, package.json, vitest.config.ts, tests/)
    - S2 — Solid 2.0 async research: https://github.com/solidjs/solid/blob/next/documentation/solid-2.0/05-async-data.md · 01-reactivity-batching-effects.md · 04-stores.md · MIGRATION.md · packages/solid-signals/src/core/{async,error,heap,scheduler}.ts · boundaries.ts · https://github.com/solidjs/solid/discussions/2425 · /releases/tag/v2.0.0-beta.0
    - S3 — Signals state-of-the-art research: https://github.com/stackblitz/alien-signals (+ releases, src/system.ts) · vuejs/core#12349 · tc39/proposal-signals · milomg/reactively Reactive-algorithms.md · sveltejs/svelte#14945 · #15592 · preactjs.com/blog/signal-boosting/ · preact signals-core src · milomg/js-reactivity-benchmark · transitive-bullshit/js-reactivity-benchmark
    - S4 — User decisions (answered log, settled): signal.is() shape/lazy-setup/write-fan-out/unlink-eviction; lanes/transitions/optimistic, action(), createOptimistic, TC39 Signal.subtle, alien createReactiveSystem all OUT OF SCOPE
- **Ownership map**: C:/Users/ICJR/.claude/storage/runtime/d--reactivity/ownership.md — src/system.ts is THE hub and rides `files-shared` on every item that hooks into it; file-contention safety comes from that `files-shared` declaration (the engine welds shared-file items), NEVER from Depends-on. Every Depends-on edge names a REAL consumed artifact (a flag, field, helper, node shape, script, or test file the prerequisite creates); document order carries the residual risk ordering

## Baseline

- Predecessor run 2f191933 landed everything except these 5 rejected items; verified in src/system.ts at authoring: signal.is selectors (:799-822), asyncMeta factory/pending (:11), the global-version fast path (:463-467), error caching (:342-362), deferred pending-write batching (:96-112), and untrack/peek/flush/batch exported (:879-893). File is 894 lines.
- package.json now exposes `agent:test` (`tsc --noEmit && vitest run`), `agent:bench`, `test` (`vitest run`), and `bench` (`vitest bench --run`) scripts — the scoped Checks below rely on `pnpm run test <file>`.
- None of the five test files (tests/equals.ts, tests/invalidate.ts, tests/unobserved.ts, tests/deep-graphs.ts, tests/async-iterable.ts) exist on disk — the rejected items' code was reverted; every item authors its test file FRESH, and that file is a non-skippable deliverable, not an implied artifact.
- Benches on disk: tests/bench/{array,cellx,dynamic,kairo,molbench,reactive-object,system}.ts.
- Standing teardown hazard (the recursion-free-walks spec gap): dispose() (src/system.ts:605-626) and unlink() (:421-458) mutually recurse through the zero-subs branch (:437-450) — a 200k-deep chain overflows the call stack on stop().
- Test-file conventions (mirror tests/untrack.ts and tests/flush.ts — the two items that PASSED the predecessor run): public-API imports from `~/system` ONLY; never `~/constants`; never direct node-state mutation; settle via `flush()` or awaited timers; `describe`/`it` with `let` comma-separated locals.

## Features

- custom-equals
- invalidate
- unobserved-hooks
- recursion-free-walks
- async-iterable-resolve

## Feed
run,scope,unit,ordinal,slug,event,state,detail,elapsed_ms,ts

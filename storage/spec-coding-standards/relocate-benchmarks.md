---
type: chore
recommended-model: opus
status: PENDING
depends-on: relocate-test-suites
api-impact: none
source: audit findings 11, 9
files-own: [bench/cellx.bench.ts, bench/dynamic.bench.ts, bench/kairo.bench.ts, bench/molbench.bench.ts, bench/system.bench.ts, bench/reactive/array.bench.ts, bench/reactive/reactive-object.bench.ts, bench/lib/reactive-adapter.ts, bench/tsconfig.json]
files-shared: [vitest.config.ts]
tests: []
---

# Relocate benchmarks to the bench/ mirror convention

## Rationale
The 7 benchmark files live at `tests/bench/*.ts`; the convention is a `bench/` root paralleling `test/` — `bench/<mirror>/<name>.bench.ts`, shared bench helpers under `bench/` but never matching `*.bench.*`. The shared adapter `tests/lib/reactive-adapter.ts` is imported ONLY by benchmarks (cellx, dynamic, kairo, molbench — verified by grep), so it is a bench helper and moves to `bench/lib/`. Folds finding 9 (molbench `const` local) to keep `files-own` non-overlapping.

## Changes
Benchmark tree layout and discovery config only; bench logic is unchanged except one `const`→`let` local fix and the adapter's import specifiers.

## Design
Mapping (dominant import subject, mirroring the test relocation's rule):
- Root (5): system (imports `~/system`), and the adapter-driven whole-framework ports cellx, dynamic, kairo, molbench → `bench/<name>.bench.ts`.
- `bench/reactive/` (2): array (imports `~/reactive/array`), reactive-object (imports `~/reactive/object`) → `bench/reactive/<name>.bench.ts`.
- Helper: `tests/lib/reactive-adapter.ts` → `bench/lib/reactive-adapter.ts` (matches no `*.bench.*`, stays outside discovery); the four consumers' specifier changes from `'../lib/reactive-adapter'` to `'./lib/reactive-adapter'` (they sit at the bench root beside `lib/`).
- molbench (finding 9): `const numbers = Array.from(...)` at line 7 becomes `let numbers = ...` — a module-level local, not an export and not truly immutable by rule.
Config:
- vitest.config.ts `test.benchmark.include` → `['bench/**/*.bench.ts']` — a small mechanical hook in the shared config this item does not own (relocate-test-suites owns it; the depends-on edge serializes the edits).
- New `bench/tsconfig.json` mirroring `test/tsconfig.json` (extends `../tsconfig.json`, `noEmit`, `rootDir: ".."`, `paths ~/* → ../src/*`, `include ["./**/*", "../src/**/*"]`) — IDE/manual type coverage for the bench tree, exactly what `tests/tsconfig.json` provided; the root `tsc --noEmit` gate includes `src/**/*` only and is unaffected.
- After the adapter moves, `tests/` is empty — delete the directory.
No `benchmarks` frontmatter and no bench-gate run: nothing here is a `type: perf` item; benchmark RESULTS are out of scope, only discovery must survive.

## Directives
1. bench/lib/reactive-adapter.ts, bench/cellx.bench.ts, bench/dynamic.bench.ts, bench/kairo.bench.ts, bench/molbench.bench.ts, bench/system.bench.ts — move the adapter and the 5 root benches from tests/lib/ and tests/bench/, deleting the sources; update the adapter import specifier in the four consumers; convert molbench's `const numbers` to `let`.
2. bench/reactive/array.bench.ts, bench/reactive/reactive-object.bench.ts — move tests/bench/{array,reactive-object}.ts, deleting the sources; `~` alias imports need no edits.
3. bench/tsconfig.json, vitest.config.ts — create bench/tsconfig.json per the Design; set `test.benchmark.include` to `['bench/**/*.bench.ts']`; delete the now-empty tests/ directory.

## Acceptance
`vitest bench --run` discovers exactly 7 benchmark files at their new paths and completes without error; no `tests/` directory remains; nothing under `bench/lib/` matches `*.bench.*`; no `const` local remains in bench/molbench.bench.ts outside exports/truly-immutable bindings.

## Verify
pnpm exec vitest bench --run

## Notes
The four adapter-driven benches assert correctness via the adapter's `assert` — a discovery-green run is also a behavior check, not just a file-move check.

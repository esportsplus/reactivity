---
type: chore
recommended-model: opus
status: PENDING
depends-on: waitfor-test-helper
api-impact: none
source: audit finding 10
files-own: [test/async-computed.test.ts, test/async-errors.test.ts, test/async-hardening.test.ts, test/async-iterable.test.ts, test/async-nested.test.ts, test/deep-graphs.test.ts, test/effects.test.ts, test/equals.test.ts, test/errors.test.ts, test/flush.test.ts, test/glitch-freedom.test.ts, test/invalidate.test.ts, test/pending-writes.test.ts, test/primitives.test.ts, test/read-dedup.test.ts, test/signal-selector.test.ts, test/system.test.ts, test/untrack.test.ts, test/reactive/array.test.ts, test/reactive/nested.test.ts, test/reactive/objects.test.ts, test/reactive/reactive.test.ts, test/compiler/compiler.test.ts, test/lib/wait-for.ts, test/tsconfig.json, vitest.config.ts, package.json]
tests: [test/async-computed.test.ts, test/async-errors.test.ts, test/async-hardening.test.ts, test/async-iterable.test.ts, test/async-nested.test.ts, test/deep-graphs.test.ts, test/effects.test.ts, test/equals.test.ts, test/errors.test.ts, test/flush.test.ts, test/glitch-freedom.test.ts, test/invalidate.test.ts, test/pending-writes.test.ts, test/primitives.test.ts, test/read-dedup.test.ts, test/signal-selector.test.ts, test/system.test.ts, test/untrack.test.ts, test/reactive/array.test.ts, test/reactive/nested.test.ts, test/reactive/objects.test.ts, test/reactive/reactive.test.ts, test/compiler/compiler.test.ts]
---

# Relocate test suites to the test/ mirror convention

## Rationale
The 23 suite files live at `tests/*.ts` with no `.test` suffix; the global convention is `test/<mirror-of-source-dir>/<name>.test.ts`. The suites are integration-style, so the mirror is resolved by each suite's dominant import subject (evidence: every suite's import block): 18 suites import only `~/system`/`~/types` — src ROOT files — and mirror to the test root; array/nested/objects/reactive target `src/reactive/*`; compiler targets `src/compiler/*`. `effects.ts` imports ReactiveArray/ReactiveObject as fixtures but its subject is system's `effect()` — classified root (Q1 carries the override).

## Changes
Test tree layout and discovery config only; suite contents are unchanged except relative helper-import specifiers on subdir moves. Source modules untouched.

## Design
Mapping (move + `.test.ts` rename, contents otherwise byte-identical — all source imports use the `~` alias, which is location-independent):
- Root (18): async-computed, async-errors, async-hardening, async-iterable, async-nested, deep-graphs, effects, equals, errors, flush, glitch-freedom, invalidate, pending-writes, primitives, read-dedup, signal-selector, system, untrack → `test/<name>.test.ts`.
- `test/reactive/` (4): array, nested, objects, reactive → `test/reactive/<name>.test.ts`; relative helper imports gain one level (`./lib/wait-for` → `../lib/wait-for`) where present.
- `test/compiler/` (1): compiler → `test/compiler/compiler.test.ts` (no helper imports).
- Helper: `tests/lib/wait-for.ts` → `test/lib/wait-for.ts` (still matches no `*.test.*` pattern, so it stays outside discovery).
Config:
- vitest.config.ts `test.include` ends at `['test/**/*.test.ts']` (a transitional dual glob keeps the suite discoverable mid-item; see Directives). `resolve.alias` is untouched — `~` points at `src/` regardless of test location.
- `tests/tsconfig.json` → `test/tsconfig.json` content-unchanged: its `rootDir: ".."`, `paths: ~/* → ../src/*`, and `include: ["./**/*", "../src/**/*"]` all resolve identically from `test/`. The root `tsc --noEmit` gate is unaffected — the base config includes `src/**/*` only (verified in @esportsplus/typescript tsconfig.base.json), so this file is IDE/manual coverage, exactly as before.
- package.json: delete the dead `build:test` script — it invokes `vite build --config test/vite.config.ts`, a config that has never existed, so the script cannot run today (Q2 carries the override).
Out of scope here: `tests/bench/**` and `tests/lib/reactive-adapter.ts` stay put for the benchmark relocation item; the `tests/` directory survives this item holding only those.

## Directives
1. vitest.config.ts — set `test.include` to the transitional dual glob `['test/**/*.test.ts', 'tests/*.ts']` so discovery stays whole while files move.
2. test/lib/wait-for.ts, test/async-computed.test.ts, test/async-errors.test.ts, test/async-hardening.test.ts, test/async-iterable.test.ts, test/async-nested.test.ts, test/deep-graphs.test.ts, test/effects.test.ts, test/equals.test.ts, test/errors.test.ts, test/flush.test.ts, test/glitch-freedom.test.ts, test/invalidate.test.ts, test/pending-writes.test.ts, test/primitives.test.ts, test/read-dedup.test.ts, test/signal-selector.test.ts, test/system.test.ts, test/untrack.test.ts — move tests/lib/wait-for.ts and the 18 root suites (tests/<name>.ts) to these paths, deleting the sources; contents unchanged.
3. test/reactive/array.test.ts, test/reactive/nested.test.ts, test/reactive/objects.test.ts, test/reactive/reactive.test.ts, test/compiler/compiler.test.ts — move the 5 subdir suites from tests/, deleting the sources; bump relative wait-for imports one level where present.
4. test/tsconfig.json — move tests/tsconfig.json here content-unchanged, deleting the source.
5. vitest.config.ts, package.json — drop the transitional `'tests/*.ts'` glob (final include `['test/**/*.test.ts']`) and delete the dead `build:test` script.

## Acceptance
All 23 suites are discovered and green at their new paths, run scoped against this item's `tests` entries; no `tests/*.ts` root suite file remains; `test/lib/wait-for.ts` is outside discovery; vitest include is exactly `['test/**/*.test.ts']`.

## Verify
pnpm exec vitest run test/system.test.ts test/reactive/reactive.test.ts test/compiler/compiler.test.ts

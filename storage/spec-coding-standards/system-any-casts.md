---
type: refactor
recommended-model: opus
status: PENDING
depends-on: none
api-impact: none
source: audit finding 1 (src/system.ts sites)
files-own: [src/system.ts]
tests: [tests/system.ts]
---

# Eliminate `any` casts in system.ts

## Rationale
Zero `any` is a hard rule (`unknown` + narrowing or precise types). src/system.ts carries two `null as any` sentinel casts on the hottest data structures in the library.

## Changes
Link-pool recycling and computed-node construction keep their exact runtime behavior; only the compile-time escape hatch changes from `any` to `unknown`-bridged precise types.

## Design
- src/system.ts:529 — `link.dep = link.sub = null as any;` becomes `link.dep = link.sub = null as unknown as Computed<unknown>;` (one chained statement preserved: `link.sub` is `Computed<unknown>`, and `Computed<unknown>` is a member of `link.dep`'s union `Signal<unknown> | Computed<unknown>`, so a single cast types both assignments).
- src/system.ts:694 — `prevHeap: null as any,` becomes `prevHeap: null as unknown as Computed<unknown>,`. The field is a self-referential heap sentinel immediately repaired by `self.prevHeap = self` at line 702; the literal cannot reference `self` before it exists, so the unknown-bridged sentinel is the precise-minimal escape.
- Settled decision: do NOT widen `Link.dep`/`Link.sub`/`Computed.prevHeap` to nullable in src/types.ts — 28 consumers read these fields on hot paths and a nullable type forces null-checks (or non-null assertions) across all of them for a state that only exists inside the pool/init window. The double-cast is the sanctioned `unknown` escape for a pool sentinel.
- Discretion: implementer may hoist a single typed sentinel helper (e.g. a module-level `const DEAD = null as unknown as Computed<unknown>`) if both sites read cleaner; criterion: zero runtime change, zero added null-checks on hot paths, zero `any` tokens.

## Reads
- src/types.ts — Link/Computed/Signal field types the casts must land on
- tests/system.ts — the covering suite for dispose/pool behavior

## Acceptance
No `any` token remains in src/system.ts; `tsc --noEmit` green; 0 regressions in tests/system.ts, run scoped.

## Verify
node -e "const s=require('fs').readFileSync('src/system.ts','utf8');process.exit(/\bany\b/.test(s)?1:0)"

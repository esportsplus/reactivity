# Document Bundle Migration Spec

## Clarifying Questions

> Answer inline under each **A:**, then tell me you're done. Blocking questions gate the feature files
> they list; optional questions already have a sensible default applied — fill one in only to override.
> I'll apply your answers and move each answered question to the Answered log (I won't ask it again).

### Open — Optional
- **Q1** · disposition of the 11 non-item run-ledger rows · affects: [convert-legacy-changelog] · assumed: option 1 (carry all 11 into `docs/completed/legacy.md`)
  `core/document/mutators.ts` `convertLegacy` collects a completed row only when it matches `^- \[`, so
  the conversion CLI carries 39 of the 50 rows on its own. The other 11 are the non-bracketed run ledger:
  `abandoned spend` ×3, `run-level spend` ×3, `cost source of truth` ×3, `follow-up discharged` ×2. They
  are spend accounting and follow-up discharge records, not item completions. `contracts/document.schema.json`
  decision 7 says the bundle holds only what git cannot recover and carries no per-run journals, which pulls
  against carrying spend rows forward; the audit finding and this run's constraint say the conversion must be
  loss-free at 50/50. Which wins?
  1. Carry all 11 into `docs/completed/legacy.md` via `doc.ts append-completion --spec-name legacy` — 50/50, matching `convertLegacy`'s own `legacy` key for unattributed rows. (Recommended)
  2. Carry only the 2 `follow-up discharged` rows (git cannot recover a discharge decision) and let the 9 spend/cost rows die with the legacy file — bundle total 41.
  3. Carry all 11 but under a per-run concept name instead of `legacy` (one completed concept per run id).
  **A:**

## Metadata
- **Generated**: 2026-07-20
- **Synthesizer**: claude-opus-4-8[1m] · seat synthesizer:fidelity · router SIMPLE
- **Research sources**: S1 `.claude/storage/code-audit/findings.md` (F-1) · S2 `.claude/CHANGELOG.md` · S3 `core/doc.ts` + `core/document/mutators.ts` · S4 `contracts/document.schema.json` decisions 7/9/10 · S5 `skills/code-audit/references/legacy-detection.md` + `references/document.md` · S6 `storage/runtime/d--reactivity/ownership.md`
- **Threshold**: n/a — no `type: perf` item in this spec
- **Total features**: 1
- **Model mix**: opus 0 · sonnet 1

## Features
- convert-legacy-changelog

## Feed
run,scope,unit,ordinal,slug,event,state,detail,elapsed_ms,ts

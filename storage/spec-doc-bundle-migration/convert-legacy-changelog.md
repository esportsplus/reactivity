---
depends-on: none
files-own: [.claude/CHANGELOG.md, README.md, docs/completed/legacy.md, docs/completed/spec-coding-standards.md, docs/completed/spec-perf-hot-paths.md, docs/completed/spec-signals-next-2.md, docs/completed/spec-signals-next.md, docs/index.md]
recommended-model: sonnet
status: PENDING
type: chore
---

# Convert the legacy machine changelog into the project document bundle

## Rationale

The project's active machine record resolves as `legacy`: `.claude/CHANGELOG.md` exists and no `docs/`
bundle does (S1 F-1, confirmed against S3 `resolveRecord` — a bundle wins only when `docs/index.md` or one
of `completed`/`rejected`/`skipped` exists, and none do). Per S5 legacy-detection (a), a legacy-only record
is converted through the doc surface by an emitted spec item, never in place by the audit.

That record is not disposable history. Its 50 rows are the project's whole suppression memory and
spec:implement's completion ledger. Seven of them are REJECTED / NOT-PURSUED entries carrying measured
counter-evidence — `lazy-computeds`, `lazy-computed-eval`, `heap-packed-array`, `array-lazy-listeners`,
`array-event-payload-guard`, `cleanup-lazy-errors`, `async-probe-typeof-gate`. Per S5 `references/document.md`
Phase 0, a future audit builds its per-agent suppression lists from `docs/rejected/`, `docs/skipped/` AND
`docs/completed/`, so a row that fails to land in the bundle is a suppression entry that stops suppressing:
the next audit re-proposes work this project already priced and rejected. A dropped row is a real
regression, not a cosmetic one.

The conversion also has a measured lossiness hazard. S3 `convertLegacy` collects a completed row only on
`^- \[`; the legacy file holds 50 `- ` rows of which only 39 are bracketed. A bare `doc.ts convert` is
therefore an 11-row loss, and the item exists partly to close that gap with the surface's own sanctioned
append mutator rather than by hand-editing anything.

## Changes

The project's machine record migrates from the single legacy changelog file to the document bundle format:
completion rows regroup into one completed-index concept per spec attribution, the reserved progressive-
disclosure index is generated over them, the project README gains a one-line pointer at the bundle, and the
legacy record is retired only once the bundle is verified to hold every row it held. No runtime, test, or
benchmark behavior changes — this item touches no library source.

## Design

Settled decisions, then the exact ordered recipe. `<config>` below is `C:/Users/ICJR/.claude`, the config
repo hosting the doc surface; `<root>` is the project root, `D:/reactivity`.

**D1 — routing.** Every write goes through `core/doc.ts` subcommands (S4 decision 9: the doc surface is the
sole routing target for any changelog-shaped artifact). No file in `docs/` is hand-authored, and
`.claude/CHANGELOG.md` is never hand-edited — it is read, then deleted whole.

**D2 — the human release changelog is out of bounds.** `<root>/CHANGELOG.md` does not exist today and MUST
NOT be created, written, or referenced by any step (S4 decision 10). `.claude/CHANGELOG.md` is the machine
record; `<root>/CHANGELOG.md` would be curated human release notes. Confusing the two is the specific defect
this item is written to prevent, so its absence is an acceptance clause, not a footnote.

**D3 — the 11-row repair.** `convertLegacy` matches completed rows on `^- \[`. Of the legacy file's 50 `- `
rows, 39 match and 11 do not: the non-bracketed run ledger, identifiable by its leading label —
`abandoned spend` (3 rows), `run-level spend` (3 rows), `cost source of truth` (3 rows),
`follow-up discharged` (2 rows). Convert alone would drop all 11. Repair them with the surface's own
`append-completion` mutator under spec name `legacy`, which is the exact key `convertLegacy` itself assigns
to a completed row lacking a `· spec:` attribution — so the destination is the format's own convention, not
an invention. Append them in their original top-to-bottom file order.

**D4 — byte-identical rows.** `appendCompletionRow` prefixes `- ` when the passed row lacks it, so pass each
row's text WITHOUT its leading `- ` and the written line is byte-identical to the legacy line. Do not
re-word, re-price, or summarize a row; the completed-index body must stay byte-compatible with the existing
changelog miners (S4 decision 8).

**D5 — no promotion to `docs/rejected/`.** The legacy file has one section only (`## Completed`); it carries
no `## Rejected` or `## Skipped` tables, so `convert` produces no `rejected/` or `skipped/` concepts and the
seven rejection rows stay rows inside their completed concepts. That is sufficient and correct: S5
`references/document.md` Phase 0 step 3 reads `docs/completed/` as a suppression source, and step 4 takes
completed entries by NAME for all agent types. Synthesizing new `rejected/` concepts is explicitly OUT OF
SCOPE — it would duplicate content that already survives verbatim.

**D6 — bundle discoverability.** Run `doc.ts init` AFTER `convert`, not before. Run after, `initBundle` sees
an existing `docs/index.md` and skips the scaffold entirely, doing only the one idempotent thing wanted: it
inserts a single pointer line after the README title. Run before, it would seed a scaffold index that makes
the record resolve as `bundle` before any row has actually been converted, which would let the
record-kind acceptance clause pass on an empty bundle.

**D7 — deletion is last and gated.** `convert` never deletes its source. Deleting `.claude/CHANGELOG.md` is
this item's own final acceptance step and runs only after the bundle checks and the 50/50 row count pass. If
any check fails, the legacy file stays and the item reports rather than deleting.

**Recipe:**

1. Record the baseline row count: the number of lines matching `^- ` in `.claude/CHANGELOG.md`. It is 50.
   Capture the 50 row texts — this is the comparison set for step 6.
2. `node <config>/core/doc.ts convert <root>` — builds `docs/completed/<spec>.md` per spec attribution plus
   `docs/index.md`. Expect four completed concepts: `spec-coding-standards`, `spec-perf-hot-paths`,
   `spec-signals-next`, `spec-signals-next-2`, holding 39 rows in total.
3. For each of the 11 non-bracketed rows from step 1, in file order:
   `node <config>/core/doc.ts append-completion <root> --spec-name legacy --row <row text without its leading "- ">`.
   Quote the row argument with SINGLE quotes in PowerShell — several of these rows contain `~$199.51`-style
   dollar amounts that a double-quoted PowerShell string would expand as variables and silently corrupt.
4. `node <config>/core/doc.ts index <root>` — regenerate the reserved index so `legacy.md` is listed.
   `append-completion` does not regenerate it.
5. `node <config>/core/doc.ts init <root>` — README pointer only (see D6).
6. Verify, in order: `doc.ts check <root>` exits 0; `doc.ts check-record <root>` exits 0 and its stdout says
   `bundle`; the `- ` rows across `docs/completed/*.md` total exactly 50 and every step-1 row text appears
   byte-identically in exactly one of them; `spec.ts check-changelog <root>` exits 0.
7. Only if step 6 fully passes: delete `.claude/CHANGELOG.md`. Then re-run `doc.ts check-record <root>` and
   `spec.ts check-changelog <root>` — both must still exit 0 with the legacy file gone.

## Reads

- .claude/CHANGELOG.md — the 50-row legacy record being converted; source of the row-count comparison set and of the 11 rows the CLI drops.
- .claude/storage/code-audit/findings.md — F-1, the finding this item implements, including its own recipe and acceptance.
- .gitignore — proves `docs/` is not ignored, which is exactly what `check-changelog` asserts about the new active record.
- README.md — receives the one-line bundle pointer from `doc.ts init`; confirm no `docs/index.md` pointer exists before running it.

## Acceptance

1. A `docs/` bundle exists and `node <config>/core/doc.ts check <root>` exits 0 with zero conformance issues.
2. `node <config>/core/doc.ts check-record <root>` exits 0 and its stdout names the `bundle` record, not `legacy`.
3. Loss-free at 50/50: the `- ` rows across `docs/completed/*.md` total exactly 50, and each of the 50 `- `
   rows captured from `.claude/CHANGELOG.md` in recipe step 1 appears byte-identically in exactly one
   completed concept — including all 7 REJECTED / NOT-PURSUED suppression rows and all 11 non-bracketed
   run-ledger rows.
4. `.claude/CHANGELOG.md` no longer exists, and its deletion happened only after clauses 1-3 passed.
5. `<root>/CHANGELOG.md` was neither created nor modified: the path does not exist at completion and
   `git status --porcelain` lists no entry for it.
6. `node <config>/core/spec.ts check-changelog <root>` exits 0 against the new bundle, with the legacy file
   already deleted.
7. Scope held: `git status --porcelain` shows changes only under `docs/`, plus the deleted
   `.claude/CHANGELOG.md` and the modified `README.md`. Zero entries under `src/`, `test/`, or `bench/` —
   this item touches no library source, so any entry there means it overreached. There are no `tests`
   entries because no suite covers this surface; regression risk is bounded by this clause instead.

## Checks

- node C:/Users/ICJR/.claude/core/doc.ts check D:/reactivity
- node C:/Users/ICJR/.claude/core/doc.ts check-record D:/reactivity
- node C:/Users/ICJR/.claude/core/spec.ts check-changelog D:/reactivity

## Verify

`node C:/Users/ICJR/.claude/core/doc.ts check-record D:/reactivity` → prints `Doc: bundle record is tracked (D:/reactivity)` and exits 0.

## Notes

- `check-record`'s exit code proves only that the active record is not git-ignored; it exits 0 for a legacy
  record too. Acceptance clause 2 is satisfied by reading its stdout, which is why this item stays
  critic-validated rather than fully deterministic.
- `convert` is a deterministic overwrite and safe to re-run while the legacy file exists, and it does not
  touch `docs/completed/legacy.md` (no legacy row carries an absent `· spec:` attribution, so it never
  produces that key itself). After the legacy file is deleted, `convert` throws by design — there is nothing
  left to convert, and that is not a failure to work around.
- The bundle must commit. `.gitignore` currently ignores only `.claude/storage/`, so `docs/` is trackable;
  do not add a `docs/` ignore rule, or the durable memory vanishes on the next clone.
- Anti-bloat carries forward (S4 decision 7): the bundle holds only what git cannot recover. Do not add run
  narrative, per-run journals, or commit-derivable prose while migrating.

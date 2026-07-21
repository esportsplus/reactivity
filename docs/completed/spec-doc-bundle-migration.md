---
title: spec-doc-bundle-migration
type: completed-index
---
# spec-doc-bundle-migration
- [convert-legacy-changelog] 9702ab6. Legacy machine record migrated to the docs/ bundle — 53/53 rows preserved byte-identically (39 via doc.ts convert + 14 non-bracketed run-ledger rows via append-completion --spec-name legacy), index regenerated, README pointer added, .claude/CHANGELOG.md deleted. Gate: doc.ts check + check-record + spec.ts check-changelog all exit 0 post-deletion; row fidelity verified programmatically (0 missing, 0 dupes) incl. all 7 REJECTED/NOT-PURSUED suppression rows. Deviations: run 59796a4d BLOCKED first — the spec Design hardcoded the absolute root D:/reactivity, so the worktree-isolated seat converted the main checkout instead of its worktree and could not clean up; completed by direct-implement in the main checkout instead. Row target rose 50 to 53 (the dead run appended 3 spend rows before this ran). · spec: spec-doc-bundle-migration

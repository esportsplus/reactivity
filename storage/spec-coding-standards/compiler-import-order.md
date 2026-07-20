---
type: refactor
recommended-model: sonnet
status: PENDING
validation: deterministic
depends-on: none
api-impact: none
source: audit finding 6 (compiler files)
files-own: [src/compiler/index.ts, src/compiler/array.ts, src/compiler/object.ts, src/compiler/primitives.ts, src/compiler/plugins/vite.ts]
tests: [tests/compiler.ts]
---

# Normalize import order across compiler modules

## Rationale
Five compiler files violate the import layout rule (destructured group alphabetical → blank line → default group). src/compiler/object.ts additionally imports the same specifier twice, and plugins/vite.ts is missing the blank line before its default-import group.

## Changes
Import statements only — dependency-safe reorders (imports hoist); zero behavior change.

## Design
Ordering rule applied: destructured group first — external specifiers alphabetical, then `~/` paths, then relative paths, alphabetical within each; a value import precedes an `import type` from the same specifier; blank line; default-import group, alphabetical. Exact final import blocks:

src/compiler/index.ts:
```ts
import { ts } from '@esportsplus/typescript';
import { imports } from '@esportsplus/typescript/compiler';
import type { ImportIntent, ReplacementIntent, TransformContext } from '@esportsplus/typescript/compiler';
import { ENTRYPOINT, NAMESPACE, PACKAGE_NAME } from './constants';
import type { Bindings } from './types';

import array from './array';
import object from './object';
import primitives from './primitives';
```

src/compiler/array.ts:
```ts
import { ts } from '@esportsplus/typescript';
import { ast, imports } from '@esportsplus/typescript/compiler';
import type { ReplacementIntent } from '@esportsplus/typescript/compiler';
import { ENTRYPOINT, NAMESPACE, PACKAGE_NAME, TYPES } from './constants';
import type { Bindings } from './types';
```

src/compiler/object.ts (merges the duplicate `@esportsplus/typescript/compiler` value imports and splits the inline `type` specifier):
```ts
import { ts } from '@esportsplus/typescript';
import { code, imports, uid } from '@esportsplus/typescript/compiler';
import type { ReplacementIntent } from '@esportsplus/typescript/compiler';
import { ENTRYPOINT, NAMESPACE, PACKAGE_NAME, TYPES } from './constants';
import type { Bindings } from './types';
```

src/compiler/primitives.ts:
```ts
import { ts } from '@esportsplus/typescript';
import type { ReplacementIntent } from '@esportsplus/typescript/compiler';
import { NAMESPACE, TYPES } from './constants';
import type { Bindings } from './types';
```

src/compiler/plugins/vite.ts (adds the blank line before the default group):
```ts
import { plugin } from '@esportsplus/typescript/compiler';
import { PACKAGE_NAME } from '../constants';

import reactivity from '..';
```

Nothing below each import block changes.

## Acceptance
`tsc --noEmit` green; 0 regressions in tests/compiler.ts, run scoped; each file's import block matches the pinned layout above.

## Checks
- node -e "const s=require('fs').readFileSync('src/compiler/object.ts','utf8');process.exit(s.includes(\"import { code, imports, uid } from '@esportsplus/typescript/compiler';\")?0:1)"
- node -e "const s=require('fs').readFileSync('src/compiler/plugins/vite.ts','utf8');process.exit(/from '\.\.\/constants';\r?\n\r?\n\r?\nimport reactivity/.test(s)||/from '\.\.\/constants';\r?\n\r?\nimport reactivity/.test(s)?0:1)"
- node -e "const s=require('fs').readFileSync('src/compiler/index.ts','utf8');process.exit(s.indexOf(\"from '@esportsplus/typescript'\")<s.indexOf(\"from '@esportsplus/typescript/compiler'\")?0:1)"
- pnpm exec tsc --noEmit
- pnpm exec vitest run tests/compiler.ts

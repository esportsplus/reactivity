# TSC Transform Analysis Report: @esportsplus/reactivity

## Executive Summary

1. **The library build is working as designed** - the reactivity library itself doesn't need transformation
2. **Test build transformations work correctly** - vite plugin transforms `reactive()` calls
3. **Confusion point**: The library PROVIDES transformers, it doesn't CONSUME them

## Findings

### How @esportsplus/typescript Custom TSC Works

| File | Purpose |
|------|---------|
| [bin/tsc](node_modules/.pnpm/@esportsplus+typescript@0.17.3/node_modules/@esportsplus/typescript/bin/tsc) | Entry point - calls build/cli/tsc.js |
| [build/cli/tsc.js:122-137](node_modules/.pnpm/@esportsplus+typescript@0.17.3/node_modules/@esportsplus/typescript/build/cli/tsc.js#L122-L137) | Main logic - checks for plugins in tsconfig |

**Critical Logic** (cli/tsc.js:128-131):
```javascript
let plugins = getPlugins(tsconfig);
if (plugins.length === 0) {
    passthrough();  // Falls back to standard tsc
    return;
}
```

**Plugin Detection** (cli/tsc.js:97-98):
```javascript
return config?.compilerOptions?.plugins?.filter(
    (p) => typeof p === 'object' && p !== null && 'transform' in p
) ?? [];
```

### Why Library Build Has No Transformations

| Issue | Evidence |
|-------|----------|
| No plugins configured | [tsconfig.json:1-3](tsconfig.json#L1-L3) only extends base config, no `compilerOptions.plugins` |
| Library defines `reactive()` | [src/reactive/index.ts:42-47](src/reactive/index.ts#L42-L47) - throws at runtime by design |
| Library doesn't use `reactive()` | Source files don't call `reactive()` as a consumer would |

### Test Build Works Correctly

**Source** ([test/primitives.ts:11](test/primitives.ts#L11)):
```typescript
let count = reactive(0);
count = 10;
console.log('Initial count:', count);
```

**Transformed Output** ([test/build/primitives.js:48-51](test/build/primitives.js#L48-L51)):
```javascript
let count = signal(0);
set(count, 10);
console.log("Initial count:", read(count));
```

**Reactive Objects** transform to classes with signal-backed getters/setters:
```javascript
class ReactiveObject_xxx {
  #count = signal(0);
  get count() { return read(this.#count); }
  set count(v) { set(this.#count, v); }
}
```

## Architecture

```
@esportsplus/reactivity
├── src/                      # Library source (NOT transformed)
│   ├── reactive/             # reactive() function definition
│   └── transformer/          # Transformer implementation
│       └── plugins/
│           ├── tsc.ts        # TSC plugin for consumers
│           └── vite.ts       # Vite plugin for consumers
├── build/                    # Compiled library (standard tsc output)
└── test/                     # Test files USING reactive()
    └── build/                # Transformed test output (via vite)
```

## Build Commands

| Command | What It Does | Uses Transformer? |
|---------|--------------|-------------------|
| `pnpm build` | Compiles library src/ to build/ | No - intentional |
| `pnpm build:test` | Compiles test/ via vite | Yes - via vite plugin |

## Expected Behavior

The reactivity library follows a **compile-time transformation** pattern:

1. **Library provides**: `reactive()` function + transformer plugins
2. **Consumers configure**: transformer plugin in their build (vite/tsc)
3. **At build time**: `reactive()` calls → signal/read/set/computed calls
4. **At runtime**: If transformation didn't happen, `reactive()` throws with helpful error

## If You Want TSC Plugins in Library Build

Add to [tsconfig.json](tsconfig.json):
```json
{
    "extends": "@esportsplus/typescript/tsconfig.package.json",
    "compilerOptions": {
        "plugins": [
            { "transform": "@esportsplus/reactivity/plugins/tsc" }
        ]
    }
}
```

**Note**: This would only affect files that actually use `reactive()` - the library source doesn't, so no change would occur.

## Recommended Actions

1. **If transformations ARE expected in library build**: Add plugins config to tsconfig.json
2. **If testing transformer**: Run `pnpm build:test` to see transformations
3. **If issue is in consuming project**: Ensure plugin is configured in consumer's build

## Next Steps

Clarify the specific scenario where transformations aren't working:
- "Show me the file that should be transformed"
- "What build command are you running?"
- "Is this the library or a consuming project?"

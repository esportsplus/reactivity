# @esportsplus/reactivity

A fine-grained reactivity system with compile-time transformations. Write reactive code with natural JavaScript syntax while the compiler generates optimized signal-based code.

## Installation

```bash
pnpm add @esportsplus/reactivity
```

## Core Concepts

The library provides a `reactive()` function that acts as a compile-time macro. At build time, transformer plugins convert `reactive()` calls into optimized signal/computed primitives.

### Reactive Primitives

```typescript
import { reactive, effect } from '@esportsplus/reactivity';

// Signals - reactive values
let count = reactive(0);
let name = reactive('John');

// Read values naturally
console.log(count);  // 0
console.log(name);   // 'John'

// Write with simple assignment
count = 10;
name = 'Jane';

// Compound assignments work
count += 5;
count++;

// Computed values - derived from other reactive values
let doubled = reactive(() => count * 2);
console.log(doubled);  // 30
```

### Reactive Objects

```typescript
import { reactive } from '@esportsplus/reactivity';

let user = reactive({
    age: 25,
    name: 'John',
    // Computed properties are arrow functions
    canVote: () => user.age >= 18
});

console.log(user.name);     // 'John'
console.log(user.canVote);  // true

user.age = 17;
console.log(user.canVote);  // false

// Cleanup resources
user.dispose();
```

### Reactive Arrays

```typescript
import { reactive } from '@esportsplus/reactivity';

let state = reactive({
    items: [1, 2, 3],
    total: () => state.items.reduce((a, b) => a + b, 0)
});

console.log(state.total);  // 6

state.items.push(4, 5);
console.log(state.total);  // 15

// Listen to array events
state.items.on('push', ({ items }) => {
    console.log('Added:', items);
});
```

### Effects

```typescript
import { effect, reactive } from '@esportsplus/reactivity';

let count = reactive(0);

let cleanup = effect(() => {
    console.log('Count is:', count);
});

count = 1;  // logs: Count is: 1
count = 2;  // logs: Count is: 2

cleanup();  // stops the effect
```

## Transformer Plugins

The library requires a build-time transformer to convert `reactive()` calls into optimized code. Two plugins are available:

### Vite Plugin

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { plugin as reactivity } from '@esportsplus/reactivity/plugins/vite';

export default defineConfig({
    plugins: [
        reactivity()
    ]
});
```

### TypeScript Custom Transformer

For direct TypeScript compilation using `ttsc` or `ts-patch`:

```json
// tsconfig.json
{
    "compilerOptions": {
        "plugins": [
            { "transform": "@esportsplus/reactivity/plugins/tsc" }
        ]
    }
}
```

## How It Works

The transformer converts your code at compile time:

**Input:**
```typescript
let count = reactive(0);
let doubled = reactive(() => count * 2);

count = 5;
console.log(doubled);
```

**Output:**
```typescript
import { computed, read, set, signal } from '@esportsplus/reactivity';

let count = signal(0);
let doubled = computed(() => read(count) * 2);

set(count, 5);
console.log(read(doubled));
```

Reactive objects are transformed into classes:

**Input:**
```typescript
let user = reactive({
    name: 'John',
    greeting: () => `Hello, ${user.name}`
});
```

**Output:**
```typescript
class ReactiveObject_1 {
    #name = signal('John');
    #greeting = null;

    get name() { return read(this.#name); }
    set name(v) { set(this.#name, v); }
    get greeting() { return read(this.#greeting ??= computed(() => `Hello, ${this.name}`)); }

    dispose() {
        if (this.#greeting) dispose(this.#greeting);
    }
}

let user = new ReactiveObject_1();
```

## API Reference

### Core Functions

| Function | Description |
|----------|-------------|
| `reactive(value)` | Creates a signal from a primitive value |
| `reactive(() => expr)` | Creates a computed value |
| `reactive({...})` | Creates a reactive object with signals and computeds |
| `reactive([...])` | Creates a reactive array |
| `effect(fn)` | Runs a function that re-executes when dependencies change |
| `root(fn)` | Creates an untracked scope for effects |
| `onCleanup(fn)` | Registers a cleanup function for the current effect |

### Low-Level Functions

These are typically only used by the transformer output:

| Function | Description |
|----------|-------------|
| `signal(value)` | Creates a raw signal |
| `computed(fn)` | Creates a raw computed |
| `read(node)` | Reads a signal or computed value |
| `set(signal, value)` | Sets a signal value |
| `dispose(computed)` | Disposes a computed and its dependencies |

### Type Guards

| Function | Description |
|----------|-------------|
| `isSignal(value)` | Checks if value is a Signal |
| `isComputed(value)` | Checks if value is a Computed |

## ReactiveArray Events

| Event | Payload | Description |
|-------|---------|-------------|
| `clear` | `undefined` | Array was cleared |
| `concat` | `{ items: T[] }` | Items were concatenated |
| `pop` | `{ item: T }` | Item was popped |
| `push` | `{ items: T[] }` | Items were pushed |
| `reverse` | `undefined` | Array was reversed |
| `set` | `{ index, item }` | Item was set at index |
| `shift` | `{ item: T }` | Item was shifted |
| `sort` | `{ order: number[] }` | Array was sorted |
| `splice` | `{ start, deleteCount, items }` | Array was spliced |
| `unshift` | `{ items: T[] }` | Items were unshifted |

## License

MIT

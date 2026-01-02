# Reactive Primitives Compiler Specification

## Overview

Extend `reactive()` to support primitive values and functions in addition to objects and arrays. The compiler transforms source code to use the underlying signal/computed primitives while providing ergonomic syntax.

---

## Type Classification

| Argument Type | Classification | Runtime Primitive | Writeable |
|---------------|----------------|-------------------|-----------|
| Object literal `{}` | object | Generated class | Yes (via properties) |
| Array literal `[]` | array | ReactiveArray | Yes (via methods) |
| Function/Arrow | computed | `computed()` | No |
| Everything else | signal | `signal()` | Yes |

### Detection Rules

```typescript
// Object - existing behavior
reactive({ count: 0 })

// Array - existing behavior
reactive([1, 2, 3])

// Computed - function expression
reactive(() => state.a + state.b)
reactive(function() { return state.a; })

// Signal - primitives, expressions, non-literal values
reactive(0)
reactive("hello")
reactive(Date.now())
reactive(someVariable)
reactive(obj.method())
```

---

## Transformation Rules

### 1. Declaration Transform

**Computed (function argument)**
```typescript
// Source
let doubled = reactive(() => count * 2);

// Compiled
let doubled = computed(() => count * 2);
```

**Signal (primitive argument)**
```typescript
// Source
let time = reactive(Date.now());

// Compiled
let time = signal(Date.now());
```

### 2. Read Transform

Transform identifier access in **read context** to `read()` call.

**Signal reads**
```typescript
// Source
console.log(time);
let x = time + 1;
html`${time}`;
if (time > 0) {}
fn(time);
time.toString();

// Compiled
console.log(read(time));
let x = read(time) + 1;
html`${read(time)}`;
if (read(time) > 0) {}
fn(read(time));
read(time).toString();
```

**Computed reads**
```typescript
// Source
console.log(doubled);

// Compiled
console.log(read(doubled));
```

### 3. Write Transform (Signals Only)

**Simple assignment**
```typescript
// Source
time = Date.now();

// Compiled
set(time, Date.now());
```

**Compound assignment** - Use `.value` to avoid read propagation
```typescript
// Source          // Compiled
count += 1;        set(count, count.value + 1);
count -= 1;        set(count, count.value - 1);
count *= 2;        set(count, count.value * 2);
count /= 2;        set(count, count.value / 2);
count %= 2;        set(count, count.value % 2);
count **= 2;       set(count, count.value ** 2);
count &= 0xFF;     set(count, count.value & 0xFF);
count |= 0x01;     set(count, count.value | 0x01);
count ^= 0xFF;     set(count, count.value ^ 0xFF);
count <<= 1;       set(count, count.value << 1);
count >>= 1;       set(count, count.value >> 1);
count >>>= 1;      set(count, count.value >>> 1);
flag &&= false;    set(flag, flag.value && false);
flag ||= true;     set(flag, flag.value || true);
value ??= 0;       set(value, value.value ?? 0);
```

**Increment/Decrement**

*Statement context* (value not used):
```typescript
// Source          // Compiled
count++;           set(count, count.value + 1);
count--;           set(count, count.value - 1);
++count;           set(count, count.value + 1);
--count;           set(count, count.value - 1);
```

*Expression context* (value used):
```typescript
// Postfix - returns OLD value
// Source
let x = count++;

// Compiled
let x = ((_v) => (set(count, _v + 1), _v))(count.value);

// Prefix - returns NEW value
// Source
let x = ++count;

// Compiled
let x = (set(count, count.value + 1), count.value);
```

### 4. Computed Write Prevention

Assignments to computed bindings are **compile-time errors**:

```typescript
let doubled = reactive(() => count * 2);
doubled = 10;  // ERROR: Cannot assign to computed reactive
doubled++;     // ERROR: Cannot assign to computed reactive
```

---

## Context Detection

### Read Contexts
- Right-hand side of assignment: `x = time`
- Operand in binary expression: `time + 1`, `time > 0`
- Template literal expression: `` `${time}` ``
- Function argument: `fn(time)`
- Property access base: `time.toString()`
- Array index: `arr[time]`
- Return statement: `return time`
- Conditional expression: `time ? a : b`
- Spread element: `[...time]` (if iterable)

### Write Contexts
- Left-hand side of assignment: `time = x`
- Compound assignment target: `time += x`
- Increment/decrement operand: `time++`, `++time`

### Excluded from Transform
- Declaration initializer (already handled): `let time = reactive(...)`
- Reassignment to new reactive: `time = reactive(...)` (creates new binding)
- typeof operand: `typeof time` (returns 'object' for signal)

---

## Binding Tracking

Track reactive bindings with their classification:

```typescript
type BindingType = 'object' | 'array' | 'signal' | 'computed';

interface ReactiveBinding {
    name: string;
    type: BindingType;
    scope: ts.Node;  // Scope where binding is valid
}
```

### Scope Rules

1. **Block scoping**: Bindings respect `let`/`const` block scope
2. **Shadowing**: Inner scope binding shadows outer
3. **Reassignment**: `x = reactive(...)` creates new binding entry

```typescript
let count = reactive(0);           // count: signal
{
    let count = 5;                 // shadows, not reactive
    console.log(count);            // no transform
}
console.log(count);                // read(count)

count = reactive(100);             // new signal binding
```

---

## Type Definitions

`reactive()` acts as a transparent wrapper - internal Signal/Computed types are not exposed to users. The compiler handles all `read()`, `set()` transformations.

```typescript
// Branded type to prevent assignment (works for primitives)
declare const COMPUTED: unique symbol;
type ComputedValue<T> = T & { readonly [COMPUTED]: true };

// Overloaded reactive() signature
// Function input → branded return type (prevents assignment)
function reactive<T extends () => unknown>(fn: T): ComputedValue<ReturnType<T>>;

// Object literal → existing ReactiveObject behavior
function reactive<T extends Record<PropertyKey, any>>(obj: Guard<T>): ReactiveObject<T>;

// Array literal → existing ReactiveArray behavior
function reactive<T>(arr: T[]): ReactiveArray<T>;

// Everything else → passthrough type (allows assignment)
function reactive<T>(value: T): T;
```

### Type Behavior

```typescript
let count = reactive(0);           // type: number
let name = reactive("hello");      // type: string
let doubled = reactive(() => 2);   // type: ComputedValue<number>

count = 5;      // OK - number assignable to number
doubled = 10;   // ERROR - number not assignable to ComputedValue<number>
```

The branded `ComputedValue<T>` type intersects `T` with a unique symbol property, making plain values incompatible for assignment while preserving the underlying type for reads.

---

## Import Injection

Add imports based on binding types found:

| Binding Type | Required Imports |
|--------------|------------------|
| signal | `signal`, `set`, `read` |
| computed | `computed`, `read` |
| object | (existing) |
| array | (existing) |

---

## Edge Cases

### 1. Destructuring
```typescript
// NOT supported - each needs explicit reactive()
let [a, b] = [reactive(1), reactive(2)];  // Error or no transform

// Supported alternative
let a = reactive(1);
let b = reactive(2);
```

### 2. Object property shorthand
```typescript
let count = reactive(0);
let obj = { count };  // { count: read(count) }
```

### 3. Computed in template (deferred access)
```typescript
let doubled = reactive(() => count * 2);
// templates would use this just like any other replacement, inline read doubled
```

### 4. Chained assignment
```typescript
let a = reactive(0);
let b = reactive(0);
a = b = 5;
// (set(b, 5), set(a, 5))
```

---

## Implementation Phases

### Phase 1: Detection
1. Scan for `reactive()` calls
2. Classify argument type
3. Build binding map with scope info

### Phase 2: Declaration Transform
1. Replace `reactive(fn)` with `computed(fn)`
2. Replace `reactive(primitive)` with `signal(primitive)`

### Phase 3: Usage Transform
1. Walk AST for identifier references
2. Check if identifier is reactive binding in scope
3. Determine read vs write context
4. Apply appropriate transformation

### Phase 4: Import Injection
1. Collect required imports from all transformations
2. Add missing imports to existing `@esportsplus/reactivity` import

---

## Validation Checklist

- [ ] Simple signal read/write
- [ ] Computed read-only
- [ ] All compound operators
- [ ] Pre/post increment in statement context
- [ ] Pre/post increment in expression context
- [ ] Nested scopes with shadowing
- [ ] Multiple reactive bindings
- [ ] Mixed with existing object/array reactives
- [ ] TypeScript type errors for computed assignment
- [ ] No transform for non-reactive same-name variables

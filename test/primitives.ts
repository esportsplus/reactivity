import { reactive } from '@esportsplus/reactivity';


// Signal creation
let count = reactive(0);
let name = reactive('test');
let flag = reactive(true);
let nullable = reactive<string | null>(null);

// Computed creation
let doubled = reactive(() => count * 2);
let greeting = reactive(() => `Hello ${name}!`);
let complex = reactive(() => flag ? count : 0);

// Read access
console.log(count);
console.log(name);
console.log(doubled);

// Write access - simple assignment
count = 10;
name = 'world';
flag = false;

// Compound assignment operators
count += 5;
count -= 2;
count *= 3;
count /= 2;
count %= 7;
count **= 2;
count &= 0xFF;
count |= 0x0F;
count ^= 0xAA;
count <<= 2;
count >>= 1;
count >>>= 1;
count &&= 1;
count ||= 0;
count ??= 42;

// Increment/decrement - statement context
count++;
count--;
++count;
--count;

// Increment/decrement - expression context (prefix)
let a = ++count;
let b = --count;
console.log(a, b);

// Increment/decrement - expression context (postfix)
let c = count++;
let d = count--;
console.log(c, d);

// Nested reads in computed
let x = reactive(1);
let y = reactive(2);
let sum = reactive(() => x + y);
let product = reactive(() => x * y);
let nested = reactive(() => sum + product);

// Conditional reads
let conditional = reactive(() => {
    if (flag) {
        return x + y;
    }
    return 0;
});

// Function with reactive reads
function calculate() {
    return count + x + y;
}

// Arrow function with reactive reads
const calc = () => count * 2;

// Reactive in loop
for (let i = 0; i < 10; i++) {
    count += i;
}

// Reassignment with new reactive
count = reactive(100);

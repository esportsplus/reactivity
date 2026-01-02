// Test: Reactive Arrays
import { effect, reactive } from '@esportsplus/reactivity';


// =============================================================================
// Basic Array Operations
// =============================================================================

console.log('=== Basic Array Operations ===');

let numbers = reactive([1, 2, 3]);

console.log('Initial:', [...numbers]);
console.log('Length:', numbers.length);

// Push
numbers.push(4, 5);
console.log('After push(4, 5):', [...numbers]);

// Pop
let popped = numbers.pop();
console.log('Popped:', popped);
console.log('After pop:', [...numbers]);

// Shift
let shifted = numbers.shift();
console.log('Shifted:', shifted);
console.log('After shift:', [...numbers]);

// Unshift
numbers.unshift(0);
console.log('After unshift(0):', [...numbers]);

// Index assignment
numbers[0] = 100;
console.log('After [0] = 100:', [...numbers]);


// =============================================================================
// Splice
// =============================================================================

console.log('\n=== Splice ===');

let items = reactive(['a', 'b', 'c', 'd', 'e']);
console.log('Initial:', [...items]);

// Remove 2 items starting at index 1
let removed = items.splice(1, 2);
console.log('Removed:', removed);
console.log('After splice(1, 2):', [...items]);

// Insert items
items.splice(1, 0, 'x', 'y');
console.log('After splice(1, 0, x, y):', [...items]);


// =============================================================================
// Sort and Reverse
// =============================================================================

console.log('\n=== Sort and Reverse ===');

let sortable = reactive([3, 1, 4, 1, 5, 9, 2, 6]);
console.log('Initial:', [...sortable]);

sortable.sort((a, b) => a - b);
console.log('After sort (asc):', [...sortable]);

sortable.reverse();
console.log('After reverse:', [...sortable]);


// =============================================================================
// Concat
// =============================================================================

console.log('\n=== Concat ===');

let base = reactive([1, 2]);
console.log('Initial:', [...base]);

base.concat([3, 4]);
console.log('After concat([3, 4]):', [...base]);

base.concat(5, [6, 7]);
console.log('After concat(5, [6, 7]):', [...base]);


// =============================================================================
// Reactive Length in Effects
// =============================================================================

console.log('\n=== Reactive Length in Effects ===');

let tracked = reactive([1, 2, 3]);
let lengthReads = 0;

effect(() => {
    lengthReads++;
    console.log(`Effect #${lengthReads}: length = ${tracked.length}`);
});

tracked.push(4);
tracked.pop();
tracked.splice(0, 1);

console.log('Total length reads:', lengthReads);


// =============================================================================
// Array Events
// =============================================================================

console.log('\n=== Array Events ===');

let observed = reactive([1, 2, 3]);

observed.on('push', (data) => {
    console.log('Push event:', data);
});

observed.on('pop', (data) => {
    console.log('Pop event:', data);
});

observed.on('set', (data) => {
    console.log('Set event:', data);
});

observed.push(4, 5);
observed.pop();
observed[0] = 100;


// =============================================================================
// Clear and Dispose
// =============================================================================

console.log('\n=== Clear and Dispose ===');

let clearable = reactive([1, 2, 3, 4, 5]);
console.log('Before clear:', [...clearable], 'length:', clearable.length);

clearable.clear();
console.log('After clear:', [...clearable], 'length:', clearable.length);

// Test: Reactive Primitives (Standalone + Object-wrapped)
import { effect, reactive } from '@esportsplus/reactivity';


// =============================================================================
// Standalone Signal Primitives
// =============================================================================

console.log('=== Standalone Signal Primitives ===');

let count = reactive(0);
let name = reactive('initial');
let flag = reactive(true);

console.log('Initial count:', count);
console.log('Initial name:', name);
console.log('Initial flag:', flag);

// Simple assignment
count = 10;
name = 'updated';
flag = false;

console.log('After assignment - count:', count);
console.log('After assignment - name:', name);
console.log('After assignment - flag:', flag);


// =============================================================================
// Standalone Computed Primitives
// =============================================================================

console.log('\n=== Standalone Computed Primitives ===');

let base = reactive(10);
let doubled = reactive(() => base * 2);
let quadrupled = reactive(() => doubled * 2);

console.log('base:', base);
console.log('doubled:', doubled);
console.log('quadrupled:', quadrupled);

base = 5;
console.log('After base = 5:');
console.log('  doubled:', doubled);
console.log('  quadrupled:', quadrupled);


// =============================================================================
// Compound Assignments with Standalone Primitives
// =============================================================================

console.log('\n=== Compound Assignments ===');

let value = reactive(10);

value += 5;
console.log('After += 5:', value);

value -= 3;
console.log('After -= 3:', value);

value *= 2;
console.log('After *= 2:', value);


// =============================================================================
// Increment/Decrement with Standalone Primitives
// =============================================================================

console.log('\n=== Increment/Decrement ===');

let counter = reactive(0);

counter++;
console.log('After counter++:', counter);

++counter;
console.log('After ++counter:', counter);

counter--;
console.log('After counter--:', counter);


// =============================================================================
// Mixed Standalone and Object Primitives
// =============================================================================

console.log('\n=== Mixed Standalone and Object ===');

let multiplier = reactive(2);

let obj = reactive({
    value: 10,
    scaled: () => obj.value * multiplier
});

console.log('obj.value:', obj.value);
console.log('obj.scaled:', obj.scaled);

multiplier = 3;
console.log('After multiplier = 3:');
console.log('  obj.scaled:', obj.scaled);

obj.value = 20;
console.log('After obj.value = 20:');
console.log('  obj.scaled:', obj.scaled);


// =============================================================================
// Effects with Standalone Primitives
// =============================================================================

console.log('\n=== Effects with Standalone Primitives ===');

let effectCount = 0;
let watched = reactive(0);

let cleanup = effect(() => {
    effectCount++;
    console.log(`Effect #${effectCount}: watched = ${watched}`);
});

watched = 1;
watched = 2;
watched = 3;

cleanup();

watched = 4; // Should not trigger effect
console.log('After cleanup, watched set to 4 (no effect should run)');
console.log('Total effect runs:', effectCount);


// =============================================================================
// String Template Computeds
// =============================================================================

console.log('\n=== String Template Computeds ===');

let firstName = reactive('John');
let lastName = reactive('Doe');
let fullName = reactive(() => `${firstName} ${lastName}`);

console.log('Full name:', fullName);

firstName = 'Jane';
console.log('After firstName = Jane:', fullName);


// =============================================================================
// Object-wrapped Primitives (original tests)
// =============================================================================

console.log('\n=== Object-wrapped Primitives ===');

let state = reactive({
    count: 0,
    flag: true,
    name: 'initial'
});

console.log('Initial count:', state.count);

state.count = 10;
state.name = 'updated';
state.flag = false;

console.log('After assignment - count:', state.count);
console.log('After assignment - name:', state.name);
console.log('After assignment - flag:', state.flag);

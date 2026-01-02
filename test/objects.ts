// Test: Reactive Objects
import { effect, reactive } from '@esportsplus/reactivity';


// =============================================================================
// Basic Object
// =============================================================================

console.log('=== Basic Reactive Object ===');

let user = reactive({
    age: 25,
    email: 'test@example.com',
    name: 'John'
});

console.log('Initial user:', { age: user.age, email: user.email, name: user.name });

user.age = 26;
user.name = 'Jane';

console.log('After updates:', { age: user.age, email: user.email, name: user.name });


// =============================================================================
// Object with Computed Properties
// =============================================================================

console.log('\n=== Object with Computed Properties ===');

let counter = reactive({
    count: 0,
    doubled: () => counter.count * 2,
    message: () => `Count is ${counter.count}`
});

console.log('Initial:', { count: counter.count, doubled: counter.doubled, message: counter.message });

counter.count = 5;
console.log('After count = 5:', { count: counter.count, doubled: counter.doubled, message: counter.message });

counter.count = 10;
console.log('After count = 10:', { count: counter.count, doubled: counter.doubled, message: counter.message });


// =============================================================================
// Object with Arrays
// =============================================================================

console.log('\n=== Object with Arrays ===');

let state = reactive({
    items: [1, 2, 3],
    total: () => state.items.reduce((a, b) => a + b, 0)
});

console.log('Initial items:', [...state.items]);
console.log('Initial total:', state.total);

state.items.push(4, 5);
console.log('After push(4, 5):', [...state.items]);
console.log('Updated total:', state.total);

state.items[0] = 10;
console.log('After items[0] = 10:', [...state.items]);


// =============================================================================
// Effects with Objects
// =============================================================================

console.log('\n=== Effects with Objects ===');

let effectRuns = 0;
let data = reactive({
    a: 1,
    b: 2,
    sum: () => data.a + data.b
});

effect(() => {
    effectRuns++;
    console.log(`Effect #${effectRuns}: a=${data.a}, b=${data.b}, sum=${data.sum}`);
});

data.a = 10;
data.b = 20;

console.log('Total effect runs:', effectRuns);


// =============================================================================
// Dispose
// =============================================================================

console.log('\n=== Dispose ===');

let disposable = reactive({
    value: 42,
    computed: () => disposable.value * 2
});

console.log('Before dispose:', disposable.value, disposable.computed);

disposable.dispose();
console.log('Disposed successfully');

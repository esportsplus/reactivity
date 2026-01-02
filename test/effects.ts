// Test: Effects and Cleanup
import { effect, onCleanup, reactive, root } from '@esportsplus/reactivity';


// =============================================================================
// Basic Effect with Object
// =============================================================================

console.log('=== Basic Effect ===');

let state = reactive({
    count: 0
});
let effectRuns = 0;

let dispose = effect(() => {
    effectRuns++;
    console.log(`Effect run #${effectRuns}: count = ${state.count}`);
});

state.count = 1;
state.count = 2;
state.count = 3;

console.log('Total runs before dispose:', effectRuns);

dispose();

state.count = 4;
state.count = 5;

console.log('Total runs after dispose:', effectRuns);


// =============================================================================
// Effect with Cleanup
// =============================================================================

console.log('\n=== Effect with Cleanup ===');

let data = reactive({
    value: 0
});
let cleanupCalls = 0;

let cleanup = effect((onCleanup) => {
    let current = data.value;
    console.log('Effect running with value:', current);

    onCleanup(() => {
        cleanupCalls++;
        console.log(`Cleanup called (${cleanupCalls}x) for value:`, current);
    });
});

data.value = 1;
data.value = 2;

cleanup();

console.log('Total cleanup calls:', cleanupCalls);


// =============================================================================
// Effect with Computed
// =============================================================================

console.log('\n=== Effect with Computed ===');

let counter = reactive({
    count: 10,
    doubled: () => counter.count * 2
});

let computedReads = 0;

effect(() => {
    computedReads++;
    console.log(`Effect #${computedReads}: doubled = ${counter.doubled}`);
});

counter.count = 20;
counter.count = 30;

console.log('Total computed reads:', computedReads);


// =============================================================================
// Root Scope
// =============================================================================

console.log('\n=== Root Scope ===');

let rootDisposed = false;

let result = root((dispose) => {
    let obj = reactive({
        a: 1,
        b: () => obj.a * 2
    });

    effect(() => {
        console.log('Root effect: a =', obj.a, 'b =', obj.b);
    });

    obj.a = 5;

    onCleanup(() => {
        rootDisposed = true;
        console.log('Root cleanup called');
    });

    dispose();

    return 'root result';
});

console.log('Root returned:', result);
console.log('Root disposed:', rootDisposed);


// =============================================================================
// Multiple Object Dependencies
// =============================================================================

console.log('\n=== Multiple Dependencies ===');

let obj1 = reactive({ x: 1 });
let obj2 = reactive({ y: 2 });
let obj3 = reactive({ z: 3 });
let multiRuns = 0;

effect(() => {
    multiRuns++;
    let sum = obj1.x + obj2.y + obj3.z;
    console.log(`Multi-dep effect #${multiRuns}: x=${obj1.x}, y=${obj2.y}, z=${obj3.z}, sum=${sum}`);
});

obj1.x = 10;
obj2.y = 20;
obj3.z = 30;

console.log('Total multi-dep runs:', multiRuns);


// =============================================================================
// Effect with Array
// =============================================================================

console.log('\n=== Effect with Array ===');

let list = reactive({
    items: [1, 2, 3],
    total: () => list.items.reduce((a, b) => a + b, 0)
});

let arrayRuns = 0;

effect(() => {
    arrayRuns++;
    console.log(`Array effect #${arrayRuns}: length=${list.items.length}, total=${list.total}`);
});

list.items.push(4);
list.items.pop();
list.items[0] = 10;

console.log('Total array runs:', arrayRuns);

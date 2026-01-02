// Test: Nested Reactive Structures
import { effect, reactive } from '@esportsplus/reactivity';


// =============================================================================
// Object with Computed accessing other objects
// =============================================================================

console.log('=== Nested Object Access ===');

let config = reactive({
    debug: true,
    theme: 'dark'
});

let settings = reactive({
    notifications: true,
    volume: 80
});

let user = reactive({
    name: 'Alice',
    getTheme: () => config.theme,
    getVolume: () => settings.volume
});

console.log('Initial config:', { debug: config.debug, theme: config.theme });
console.log('Initial user:', user.name, 'theme:', user.getTheme, 'volume:', user.getVolume);

config.theme = 'light';
settings.volume = 50;

console.log('After updates:');
console.log('  user theme:', user.getTheme);
console.log('  user volume:', user.getVolume);


// =============================================================================
// Object with Array of Objects
// =============================================================================

console.log('\n=== Object with Array of Reactive Objects ===');

let todo1 = reactive({ done: false, text: 'Learn reactivity' });
let todo2 = reactive({ done: true, text: 'Build app' });
let todo3 = reactive({ done: false, text: 'Test everything' });

let store = reactive({
    todos: [todo1, todo2, todo3],
    completedCount: () => store.todos.filter(t => t.done).length
});

console.log('Initial todos:');
for (let i = 0; i < store.todos.length; i++) {
    let todo = store.todos[i];
    console.log(`  [${todo.done ? 'x' : ' '}] ${todo.text}`);
}
console.log('Completed:', store.completedCount);

todo1.done = true;
console.log('After marking todo1 done:');
console.log('Completed:', store.completedCount);

let todo4 = reactive({ done: false, text: 'Deploy' });
store.todos.push(todo4);

console.log('After adding todo4:');
for (let i = 0; i < store.todos.length; i++) {
    let todo = store.todos[i];
    console.log(`  [${todo.done ? 'x' : ' '}] ${todo.text}`);
}


// =============================================================================
// Array of Arrays (using reactive arrays)
// =============================================================================

console.log('\n=== Array of Arrays ===');

let row1 = reactive([1, 2, 3]);
let row2 = reactive([4, 5, 6]);
let row3 = reactive([7, 8, 9]);

let matrix = reactive([row1, row2, row3]);

console.log('Initial matrix:');
for (let row of matrix) {
    console.log(' ', [...row]);
}

row1[0] = 100;
row2.push(60);

let row4 = reactive([10, 11, 12]);
matrix.push(row4);

console.log('After updates:');
for (let row of matrix) {
    console.log(' ', [...row]);
}


// =============================================================================
// Cross-Object Computed Dependencies
// =============================================================================

console.log('\n=== Cross-Object Computed Dependencies ===');

let data = reactive({
    items: [10, 20, 30],
    multiplier: 2
});

let calcObj = reactive({
    sum: () => data.items.reduce((a: number, b: number) => a + b, 0),
    total: () => calcObj.sum * data.multiplier
});

console.log('Initial sum:', calcObj.sum);
console.log('Initial total:', calcObj.total);

data.items.push(40);
console.log('After push(40) - sum:', calcObj.sum, 'total:', calcObj.total);

data.multiplier = 3;
console.log('After multiplier = 3 - sum:', calcObj.sum, 'total:', calcObj.total);


// =============================================================================
// Effects Tracking Multiple Objects
// =============================================================================

console.log('\n=== Effects Tracking Multiple Objects ===');

let effectRuns = 0;

let obj1 = reactive({ value: 1 });
let obj2 = reactive({ value: 2 });
let obj3 = reactive({ combined: () => obj1.value + obj2.value });

effect(() => {
    effectRuns++;
    console.log(`Effect #${effectRuns}: obj1=${obj1.value}, obj2=${obj2.value}, combined=${obj3.combined}`);
});

obj1.value = 10;
obj2.value = 20;

console.log('Total effect runs:', effectRuns);


// =============================================================================
// Primitives Referencing Objects
// =============================================================================

console.log('\n=== Primitives Referencing Objects ===');

let source = reactive({
    base: 10,
    items: [1, 2, 3]
});

let derived = reactive(() => source.base * 2);
let itemSum = reactive(() => source.items.reduce((a: number, b: number) => a + b, 0));

console.log('Initial derived:', derived);
console.log('Initial itemSum:', itemSum);

source.base = 20;
source.items.push(4);

console.log('After updates:');
console.log('  derived:', derived);
console.log('  itemSum:', itemSum);


// =============================================================================
// Dispose Individual Objects
// =============================================================================

console.log('\n=== Dispose Individual Objects ===');

let parent = reactive({
    value: 42,
    doubled: () => parent.value * 2
});

let child = reactive({
    parentValue: () => parent.value,
    ownValue: 10
});

console.log('Before dispose - parent.value:', parent.value, 'child.parentValue:', child.parentValue);

parent.dispose();
console.log('Parent disposed');

// Child still works with its own value
console.log('Child ownValue:', child.ownValue);
child.dispose();
console.log('Child disposed');

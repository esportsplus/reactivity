import { effect, reactive } from '../src';


let state = reactive({
    count: 0,
    items: [1, 2, 3],
    name: 'test',
    doubled: () => state.count * 2
});

effect(() => {
    console.log('Count:', state.count);
    console.log('Doubled:', state.doubled);
    console.log('Items length:', state.items.length);
});

state.doubled = () => 10;

state.count = 1;
state.count = 2;
state.items.push(4);
state.items[0] = 10;

console.log('Final state:', {
    count: state.count,
    doubled: state.doubled,
    items: [...state.items],
    name: state.name
});

state.dispose();

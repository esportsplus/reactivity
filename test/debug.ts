import { reactive } from '@esportsplus/reactivity';

let value = reactive({
    hey: () => 'sadasd'
});

console.log(value.hey);

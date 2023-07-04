import { computed, read } from './signal';
import { Computed } from './types';
import context from './context';


export default <T extends <A, R>(...args: A[]) => R>(fn: Computed<T>['fn'], options: Parameters<typeof computed>[1] = {}) => {
    let node = computed(fn, options);

    return context.node(
        (...args: Parameters<ReturnType<typeof fn>>) => {
            return (read(node) as ReturnType<typeof fn>)(...args);
        },
        node
    );
};
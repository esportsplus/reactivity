import { computed, read } from '~/core';
import { NODE } from '~/symbols';
import { Options } from '~/types';


export default (fn: () => (...args: unknown[]) => unknown, options: Options = {}) => {
    let node = computed(fn, options);

    node.context = function (...args: Parameters<ReturnType<typeof fn>>) {
        return (read(node) as ReturnType<typeof fn>)(...args);
    };
    node.context[NODE] = node;

    return node.context;
};
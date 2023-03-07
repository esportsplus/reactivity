import { computed, on, read } from '~/core';
import { NODE } from '~/symbols';
import { Fn, Listener, Options } from '~/types';


export default <T>(fn: Fn<T>, options: Options = {}) => {
    let node = computed(fn, options);

    node.context = function () {
        return read(node);
    };
    node.context[NODE] = node;
    node.context.on = (event: symbol, listener: Listener) => on(event, listener, node);

    return node.context;
};
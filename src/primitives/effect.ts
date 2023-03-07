import { effect, on } from '~/core';
import { NODE } from '~/symbols';
import { Listener, Options } from '~/types';


export default (fn: () => unknown, options: Options = {}) => {
    let node = effect(fn, options);

    return node.context = {
        [NODE]: node,
        on: (event: symbol, listener: Listener) => on(event, listener, node)
    };
};
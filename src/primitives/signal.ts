import { read, signal, write } from '~/core';
import { NODE } from '~/symbols';
import { Options } from '~/types';


export default <T>(data: T, options: Options = {}) => {
    let node = signal(data, options);

    return node.context = {
        [NODE]: node,
        get: () => {
            return read(node);
        },
        set: (value: T) => {
            write(node, value);
        }
    };
};
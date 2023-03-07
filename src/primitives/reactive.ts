import { computed as c, read, signal as s, write } from '~/core';
import { NODES } from '~/symbols';
import { Fn, Infer, Options, Signal } from '~/types';
import computed from './computed';
import signal from './signal';


export default <T>(value: Fn<T> | T, options: Options = {}) => {
    if (typeof value === 'object' && value !== null && (value.constructor === Object)) {
        let nodes: Record<string, Signal> = {},
            properties: PropertyDescriptorMap = {};

        for (let key in value) {
            if (typeof value[key] === 'function') {
                nodes[key] = c(value[key] as Parameters<typeof c>[0], options);
                properties[key] = {
                    get() {
                        return read(nodes[key]);
                    }
                };
            }
            else {
                nodes[key] = s(value[key], options);
                properties[key] = {
                    get() {
                        return read(nodes[key]);
                    },
                    set(value) {
                        write(nodes[key], value);
                    }
                };
            }
        }

        return Object.defineProperties({ [NODES]: Object.values(nodes) }, properties) as Infer<typeof value>;
    }

    if (typeof value === 'function') {
        return computed(value as Parameters<typeof computed>[0], options);
    }

    return signal(value, options);
};
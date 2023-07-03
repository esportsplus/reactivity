import { computed, read, signal, write } from '~/signal';
import { Context, Signal } from '~/types';
import context from '~/context';


type Infer<T> =
    T extends (...args: unknown[]) => unknown
        ? ReturnType<T>
        : T extends Record<PropertyKey, unknown>
            ? { [K in keyof T]: T[K] }
            : T;

type Never = { [K in keyof Context]?: never };

type Options = Parameters<typeof computed>[1] | Parameters<typeof signal>[1];


export default <T extends Record<PropertyKey, unknown>>(data: T & Never, options: Options = {}) => {
    let host = {},
        nodes: Record<PropertyKey, Signal<unknown>> = {};

    for (let key in (data as T)) {
        if (typeof data[key] === 'function') {
            nodes[key] = computed(data[key] as Parameters<typeof computed>[0], options);

            Object.defineProperty(host, key, {
                get() {
                    return read(nodes[key]);
                }
            });
        }
        else {
            nodes[key] = signal(data[key], options);

            Object.defineProperty(host, key, {
                get() {
                    return read(nodes[key]);
                },
                set(data) {
                    write(nodes[key], data);
                }
            });
        }
    }

    return context.nodes(host as Infer<T> & Context, nodes);
};
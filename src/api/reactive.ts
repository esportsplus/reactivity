import { computed, read, signal, write } from '~/signal';
import { Computed, Context, Infer, Signal } from '~/types';
import context from '~/context';


type Data = {
    [key in keyof Context]: never
} & Record<PropertyKey, Parameters<typeof computed>[0] | Parameters<typeof signal>[0]>;

type Options = Parameters<typeof computed>[1] | Parameters<typeof signal>[1];


export default <T>(data: Data, options: Options = {}) => {
    let host = {},
        nodes: Record<PropertyKey, Signal<any>> = {};

    for (let key in data) {
        if (typeof data[key] === 'function') {
            nodes[key] = computed(data[key] as Computed<T>['fn'], options);

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

    return context.nodes(host as Infer<typeof data>, nodes);
};
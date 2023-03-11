import { computed, read, root, signal, write } from '~/signal';
import context from '~/context';


// TODO:
// - Add status value
// - Add reject/stop method
export default (fn: <A, R extends Promise<any>>(...args: A[]) => R, options: Parameters<typeof computed>[1] = {}) => {
    let input: unknown,
        nodes = {
            data: signal(options?.value, options),
            status: signal(undefined, options)
        };

    function host(this: typeof host, ...args: Parameters<typeof fn>) {
        input = args;

        root(() => {
            fn(...args)
                .then(<T>(value: T) => {
                    write(nodes.data, value);
                })
                .catch(() => {
                    write(nodes.data, undefined);
                });
        });
    }

    Object.defineProperties(host, {
        data: {
            get() {
                return read(nodes.data);
            }
        },
        input: {
            get() {
                return input;
            }
        },
        status: {
            get() {
                return read(nodes.status);
            }
        }
    });

    return context.nodes(host, nodes);
};
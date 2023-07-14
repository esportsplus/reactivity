import { computed, read, root, signal, write } from './signal';
import context from './context';


export default (fn: <A, R extends Promise<any>>(...args: A[]) => R, options: Parameters<typeof computed>[1] = {}) => {
    let input: unknown,
        nodes = {
            data: signal(options.value, options),
            ok: signal(undefined, options)
        },
        stop = false;

    function host(this: typeof host, ...args: Parameters<typeof fn>) {
        input = args;
        stop = false;

        root(() => {
            write(nodes.ok, undefined);

            fn(...args)
                .then(<T>(value: T) => {
                    if (stop) {
                        return;
                    }

                    write(nodes.data, value);
                    write(nodes.ok, true);
                })
                .catch(() => {
                    if (stop) {
                        return;
                    }

                    write(nodes.data, undefined);
                    write(nodes.ok, false);
                });
        });
    }

    host.stop = () => {
        stop = true;
    };

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
        ok: {
            get() {
                return read(nodes.ok);
            }
        }
    });

    return context.nodes(host, nodes);
};
import { isNumber, Prettify } from '@esportsplus/utilities';
import { REACTIVE_ARRAY } from '~/constants';
import { Infer } from '~/types';
import { isReactiveObject } from './object';


type API<T extends unknown[]> = Prettify<
    Infer<T> & {
        clear: () => void;
        dispose: () => void;
        dispatch: <K extends keyof Events<T>, V>(event: K, value?: V) => void;
        map: <R>(this: API<T>, fn: (this: API<T>, value: T, i: number) => R, i?: number, n?: number) => R[];
        on: <K extends keyof Events<T>>(event: K, listener: Listener<Events<T>[K]>) => void;
        once: <K extends keyof Events<T>>(event: K, listener: Listener<Events<T>[K]>) => void;
    }
>;

type Events<T> = {
    clear: undefined,
    pop: {
        item: T;
    };
    push: {
        items: T[];
    };
    reverse: undefined;
    set: {
        index: number;
        item: T;
    };
    shift: {
        item: T;
    };
    sort: undefined;
    splice: {
        deleteCount: number;
        items: T[];
        start: number;
    };
    unshift: {
        items: T[];
    };
};

type Listener<V> = {
    once?: boolean;
    (value: V): void;
};

type Listeners = Record<string, (Listener<any> | null)[]>;


function cleanup<T>(item: T) {
    if (isReactiveObject(item)) {
        item.dispose();
    }
}

function clear<T>(data: T[], listeners: Listeners) {
    dispose(data);
    dispatch(listeners, 'clear');
}

function dispatch<T, K extends keyof Events<T>, V>(listeners: Listeners, event: K, value?: V) {
    if (listeners === null || listeners[event] === undefined) {
        return;
    }

    let bucket = listeners[event];

    for (let i = 0, n = bucket.length; i < n; i++) {
        let listener = bucket[i];

        if (listener === null) {
            continue;
        }

        try {
            listener(value);

            if (listener.once !== undefined) {
                bucket[i] = null;
            }
        }
        catch {
            bucket[i] = null;
        }
    }
}

function dispose<T>(data: T[]) {
    let item;

    while (item = data.pop()) {
        cleanup(item);
    }
}

function map<T extends unknown[], R>(
    data: T,
    proxy: API<T>,
    fn: (this: API<T>, value: T[number], i: number) => R,
    i?: number,
    n?: number
) {
    if (i === undefined) {
        i = 0;
    }

    if (n === undefined) {
        n = data.length;
    }

    n = Math.min(n, data.length);

    let values: R[] = new Array(n - i);

    for (; i < n; i++) {
        values[i] = fn.call(proxy, data[i], i);
    }

    return values;
}

function on<T, K extends keyof Events<T>>(listeners: Listeners, event: K, listener: Listener<Events<T>[K]>) {
    let bucket = listeners[event];

    if (bucket === undefined) {
        listeners[event] = [listener];
    }
    else {
        let hole = bucket.length;

        for (let i = 0, n = hole; i < n; i++) {
            let l = bucket[i];

            if (l === listener) {
                return;
            }
            else if (l === null && hole === n) {
                hole = i;
            }
        }

        bucket[hole] = listener;
    }
}

function once<T, K extends keyof Events<T>>(listeners: Listeners, event: K, listener: Listener<Events<T>[K]>) {
    listener.once = true;
    on(listeners, event, listener);
}

function pop<T>(data: T[], listeners: Listeners) {
    let item = data.pop();

    if (item !== undefined) {
        cleanup(item);
        dispatch(listeners, 'pop', { item });
    }

    return item;
}

function push<T>(data: T[], listeners: Listeners, items: T[]) {
    let n = data.push(...items);

    dispatch(listeners, 'push', { items });

    return n;
}

function reverse<T>(data: T[], listeners: Listeners) {
    data.reverse();
    dispatch(listeners, 'reverse');
}

function shift<T>(data: T[], listeners: Listeners) {
    let item = data.shift();

    if (item !== undefined) {
        cleanup(item);
        dispatch(listeners, 'shift', { item });
    }

    return item;
}

function sort<T extends unknown[]>(data: T, listeners: Listeners, fn: (a: T[number], b: T[number]) => number) {
    data.sort((a, b) => fn(a, b));
    dispatch(listeners, 'sort');
}

function splice<T extends unknown[]>(data: T, listeners: Listeners, start: number, deleteCount: number = data.length, items: T[] = []) {
    let removed = data.splice(start, deleteCount, ...items);

    if (items.length > 0 || removed.length > 0) {
        for (let i = 0, n = removed.length; i < n; i++) {
            cleanup(removed[i]);
        }

        dispatch(listeners, 'splice', {
            deleteCount,
            items,
            start
        });
    }

    return removed;
}

function unshift<T>(data: T[], listeners: Listeners, items: T[]) {
    let length = data.unshift(...items);

    dispatch(listeners, 'unshift', { items });

    return length;
}


export default <T extends unknown[]>(data: T) => {
    let listeners: Listeners = {},
        proxy = new Proxy({}, {
            get(_, key: any) {
                if (isNumber(key)) {
                    return data[key];
                }
                else if (key in wrapper) {
                    return wrapper[key as keyof typeof wrapper];
                }
                else if (key === 'length') {
                    return data.length;
                }

                return data[key];
            },
            set(_, key: any, value: any) {
                if (isNumber(key)) {
                    splice(data, listeners, key, 1, value);
                }
                else if (key === 'length') {
                    if (value >= data.length) {
                    }
                    else if (value === 0) {
                        clear(data, listeners);
                    }
                    else {
                        splice(data, listeners, value);
                    }
                }
                else {
                    return false;
                }

                return true;
            }
        }) as API<T>,
        wrapper = {
            [REACTIVE_ARRAY]: true,
            at: (i: number) => data[i],
            clear: () => {
                clear(data, listeners);
                return proxy;
            },
            dispatch: <K extends keyof Events<T>, V>(event: K, value?: V) => {
                dispatch(listeners, event, value);
                return proxy;
            },
            dispose: () => {
                dispose(data);
                return proxy;
            },
            map: <R>(
                fn: (this: API<T>, value: T[number], i: number) => R,
                i?: number,
                n?: number
            ) => {
                return map(data, proxy, fn, i, n);
            },
            on: <K extends keyof Events<T>>(event: K, listener: Listener<Events<T>[K]>) => {
                on(listeners, event, listener);
                return proxy;
            },
            once: <K extends keyof Events<T>>(event: K, listener: Listener<Events<T>[K]>) => {
                once(listeners, event, listener);
                return proxy;
            },
            pop: () => pop(data, listeners),
            push: (...items: T[]) => push(data, listeners, items),
            reverse: () => {
                reverse(data, listeners);
                return proxy;
            },
            shift: () => shift(data, listeners),
            sort: (fn: (a: T[number], b: T[number]) => number) => {
                sort(data, listeners, fn);
                return proxy;
            },
            splice: (start: number, deleteCount?: number, ...items: T[]) => {
                return splice(data, listeners, start, deleteCount, items);
            },
            unshift: (...items: T[]) => unshift(data, listeners, items),
        };

    return proxy;
};
export type { API as ReactiveArray };

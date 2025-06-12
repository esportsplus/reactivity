import { Infer, Prettify } from '~/types';
import { isInstanceOf, isNumber, isObject } from '@esportsplus/utilities';
import { dispose, signal, Reactive } from '~/signal';
import { Listener, Options, ReactiveObject, Signal } from '~/types';
import object from './object';


type API<T> = Prettify< Infer<T>[] & ReturnType<typeof methods<T>> >;

type Events<T> = {
    pop: {
        item: Item<T>;
    };
    push: {
        items: Item<T>[];
    };
    reverse: undefined;
    set: {
        index: number;
        item: Item<T>;
    };
    shift: {
        item: Item<T>;
    };
    sort: undefined;
    splice: {
        deleteCount: number;
        items: Item<T>[];
        start: number;
    };
    unshift: {
        items: Item<T>[];
    };
};

type Item<T> = T extends Record<PropertyKey, unknown> ? ReactiveObject<T> : Signal<T>;


// REMINDER:
// - @ts-ignore flags are supressing type mismatch error
// - Input values are being transformed by this class into reactive values and back during get
class ReactiveArray<T> extends Array<Item<T>> {
    private options: Options;
    private proxy: API<T>;
    private signal: Signal<boolean>;


    constructor(data: Item<T>[], proxy: API<T>, options: Options = {}) {
        super();

        // Only method I could use to prevent TS and runtime JS errors
        for (let i = 0, n = data.length; i < n; i++) {
            super.push(data[i]);
        }

        this.options = options;
        this.proxy = proxy;
        this.signal = signal(false);
    }


    set length(n: number) {
        if (n > this.length) {
            return;
        }

        this.splice(n);
    }


    at(i: number) {
        let value = super.at(i);

        if (isInstanceOf(value, Reactive)) {
            return value.get();
        }

        return value;
    }

    dispatch<E extends keyof Events<T>>(event: E, data?: Events<T>[E]) {
        this.signal.dispatch(event, data);
    }

    dispose() {
        this.signal.dispose();
        dispose(this);
    }

    // @ts-ignore
    indexOf(value: T) {
        for (let i = 0, n = this.length; i < n; i++) {
            if (this[i].value === value) {
                return i;
            }
        }

        return -1;
    }

    // @ts-ignore
    map<U>(fn: (this: API<T>, value: T, i: number) => U, i?: number, n?: number) {
        let proxy = this.proxy,
            values: U[] = [];

        if (i === undefined) {
            i = 0;
        }

        if (n === undefined) {
            n = this.length;
        }

        n = Math.min(n, this.length);

        for (; i < n; i++) {
            let item = this[i];

            values.push(
                fn.call(proxy, isInstanceOf(item, Reactive) ? item.value : item, i)
            );
        }

        return values;
    }

    on<E extends keyof Events<T>>(event: E, listener: Listener<Events<T>[E]>) {
        this.signal.on(event, listener);
    }

    once<E extends keyof Events<T>>(event: E, listener: Listener<Events<T>[E]>) {
        this.signal.once(event, listener);
    }

    pop() {
        let item = super.pop();

        if (item !== undefined) {
            dispose(item);
            this.signal.dispatch('pop', { item });
        }

        return item;
    }

    // @ts-ignore
    push(...input: T[]) {
        let items = factory(input, this.options),
            n = super.push(...items);

        this.signal.dispatch('push', { items });

        return n;
    }

    // @ts-ignore
    reverse() {
        super.reverse();
        this.signal.dispatch('reverse');

        return this;
    }

    shift() {
        let item = super.shift();

        if (item !== undefined) {
            dispose(item);
            this.signal.dispatch('shift', { item });
        }

        return item;
    }

    // @ts-ignore
    sort(fn: (a: T, b: T) => number) {
        super.sort((a, b) => fn(
            isInstanceOf(a, Reactive) ? a.value : a,
            isInstanceOf(b, Reactive) ? b.value : b
        ));
        this.signal.dispatch('sort');

        return this;
    }

    // @ts-ignore
    splice(start: number, deleteCount: number = super.length, ...input: T[]) {
        let items = factory(input, this.options),
            removed = super.splice(start, deleteCount, ...items);

        if (items.length > 0 || removed.length > 0) {
            dispose(removed);
            this.signal.dispatch('splice', {
                deleteCount,
                items,
                start
            });
        }

        return removed;
    }

    // @ts-ignore
    unshift(...input: T[]) {
        let items = factory(input, this.options),
            length = super.unshift(...items);

        this.signal.dispatch('unshift', { items });

        return length;
    }
}


function factory<T>(input: T[], options: Options = {}) {
    let items: Item<T>[] = [];

    for (let i = 0, n = input.length; i < n; i++) {
        let value = input[i];

        if (isObject(value)) {
            // @ts-ignore
            items[i] = object(value, options);
        }
        else {
            // @ts-ignore
            items[i] = signal(value);
        }
    }

    return items;
}

function methods<T>(a: ReactiveArray<T>): Prettify<
    {
        get constructor(): typeof a['constructor'];
        get length(): number;
        set length(n: number);
    } & Pick<
        typeof a,
        'at' |
        'dispatch' | 'dispose' |
        'indexOf' |
        'map' |
        'on' | 'once' |
        'pop' | 'push' |
        'reverse' |
        'shift' | 'sort' | 'splice' |
        'unshift'
    >
> {
    return {
        get constructor() {
            return a.constructor;
        },
        get length() {
            return a.length;
        },
        set length(n: number) {
            a.length = n;
        },
        at: (index) => a.at(index),
        dispatch: (event, data) => a.dispatch(event, data),
        dispose: () => a.dispose(),
        indexOf: (value) => a.indexOf(value),
        map: (fn, i, n) => a.map(fn, i, n),
        on: (event, listener) => a.on(event, listener),
        once: (event, listener) => a.once(event, listener),
        pop: () => a.pop(),
        push: (...input) => a.push(...input),
        reverse: () => a.reverse(),
        shift: () => a.shift(),
        sort: (fn) => a.sort(fn),
        splice: (start, deleteCount, ...input) => a.splice(start, deleteCount, ...input),
        unshift: (...input) => a.unshift(...input)
    };
}


// - Proxies are slow...
// - `this.[property]` goes through proxy
// - Wrapper slows down creation in exchange for 'faster' runtime use
export default <T>(input: T[], options: Options = {}) => {
    let proxy = new Proxy({}, {
            get(_: any, key: any) {
                if (isNumber(key)) {
                    let value = a[key];

                    if (isInstanceOf(value, Reactive)) {
                        return value.get();
                    }

                    return value;
                }
                else if (key in m) {
                    return m[key as keyof typeof m];
                }

                return a[key];
            },
            set(_: any, key: any, value: any) {
                if (isNumber(key)) {
                    let host = a[key];

                    if (host === undefined) {
                        a[key] = factory([value] as T[], options)[0];
                    }
                    else if (isInstanceOf(host, Reactive)) {
                        host.set(value);
                    }
                    else {
                        return false;
                    }

                    return true;
                }

                return a[key] = value;
            }
        }) as API<T>;

    let a = new ReactiveArray(factory(input, options), proxy),
        m = methods(a);

    return proxy;
};
export type { API as ReactiveArray };
import { Infer } from '~/types';
import { isInstanceOf, isNumber, isObject } from '@esportsplus/utilities';
import { dispose, signal, Reactive } from '~/signal';
import { Listener, Options, ReactiveObject, Signal } from '~/types';
import object from './object';


type API<T> = Infer<T>[] & ReactiveArray<T>;

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


class ReactiveArray<T> {
    private data: Item<T>[]
    private options: Options;
    private proxy: API<T>;
    private signal: Signal<boolean>;


    constructor(data: Item<T>[], proxy: API<T>, options: Options = {}) {
        this.data = data;
        this.options = options;
        this.proxy = proxy;
        this.signal = signal(false);
    }


    get length(): number {
        return this.data.length;
    }

    set length(n: number) {
        if (n > this.data.length) {
            return;
        }

        this.splice(n);
    }


    at(i: number) {
        let value = this.data[i];

        if (isInstanceOf(value, Reactive)) {
            return value.get();
        }

        return value;
    }

    dispatch<E extends keyof Events<unknown>>(event: E, data?: Events<T>[E]) {
        this.signal.dispatch(event, data);
    }

    dispose() {
        this.signal.dispose();
        dispose(this);
    }

    indexOf(value: T, fromIndex?: number) {
        let data = this.data;

        for (let i = fromIndex ?? 0, n = data.length; i < n; i++) {
            if (data[i].value === value) {
                return i;
            }
        }

        return -1;
    }

    map<U>(fn: (this: API<T>, value: T, i: number) => U, i?: number, n?: number) {
        let { data, proxy } = this,
            values: U[] = [];

        if (i === undefined) {
            i = 0;
        }

        if (n === undefined) {
            n = data.length;
        }

        n = Math.min(n, data.length);

        for (; i < n; i++) {
            let item = data[i];

            values.push(
                fn.call(proxy, isInstanceOf(item, Reactive) ? item.value : item, i)
            );
        }

        return values;
    }

    on<E extends keyof Events<unknown>>(event: E, listener: Listener<Events<T>[E]>) {
        this.signal.on(event, listener);
    }

    once<E extends keyof Events<unknown>>(event: E, listener: Listener<Events<T>[E]>) {
        this.signal.once(event, listener);
    }

    pop() {
        let item = this.data.pop();

        if (item !== undefined) {
            dispose(item);
            this.signal.dispatch('pop', { item });
        }

        return item;
    }

    push(...input: T[]) {
        let items = factory(input, this.options),
            n = this.data.push(...items);

        this.signal.dispatch('push', { items });

        return n;
    }

    reverse() {
        this.data.reverse();
        this.signal.dispatch('reverse');

        return this;
    }

    shift() {
        let item = this.data.shift();

        if (item !== undefined) {
            dispose(item);
            this.signal.dispatch('shift', { item });
        }

        return item;
    }

    sort(fn: (a: T, b: T) => number) {
        this.data.sort((a, b) => fn(
            isInstanceOf(a, Reactive) ? a.value : a,
            isInstanceOf(b, Reactive) ? b.value : b
        ));
        this.signal.dispatch('sort');

        return this;
    }

    splice(start: number, deleteCount: number = this.data.length, ...input: T[]) {
        let items = factory(input, this.options),
            removed = this.data.splice(start, deleteCount, ...items);

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

    unshift(...input: T[]) {
        let items = factory(input, this.options),
            length = this.data.unshift(...items);

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


export default <T>(input: T[], options: Options = {}) => {
    let wrapped = factory(input, options),
        proxy = new Proxy({}, {
            get(_: any, key: any) {
                if (isNumber(key)) {
                    let value = wrapped[key];

                    if (isInstanceOf(value, Reactive)) {
                        return value.get();
                    }

                    return value;
                }
                else if (key in a) {
                    return a[key as keyof typeof a];
                }

                return wrapped[key];
            },
            set(_: any, key: any, value: any) {
                if (isNumber(key)) {
                    let host = wrapped[key];

                    if (host === undefined) {
                        wrapped[key] = factory([value] as T[], options)[0];
                    }
                    else if (isInstanceOf(host, Reactive)) {
                        host.set(value);
                    }
                    else {
                        return false;
                    }

                    return true;
                }
                else if (key === 'length') {
                    return a.length = value;
                }

                return false;
            }
        }) as API<T>;

    let a = new ReactiveArray(wrapped, proxy);

    return proxy;
};
export type { API as ReactiveArray };
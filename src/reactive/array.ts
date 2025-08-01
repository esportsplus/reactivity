import { isArray, isFunction, isInstanceOf, isNumber, isObject } from '@esportsplus/utilities';
import { computed, dispose, isComputed, read } from '~/signal';
import { Computed, Infer } from '~/types';
import object, { ReactiveObject } from './object';
import { Disposable } from './disposable';


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

type Item<T> = Computed<T> | API<T> | ReactiveObject<T extends Record<PropertyKey, unknown> ? T : never> | T;

type Listener<V> = {
    once?: boolean;
    (value: V): void;
};

type Value<T> =
    T extends Record<PropertyKey, unknown>
        ? ReactiveObject<T>
        : T extends Array<infer U>
            ? API<U>
            : T;


class ReactiveArray<T> extends Disposable {
    private data: Item<T>[];
    private listeners: Record<string, (Listener<any> | null)[]> | null = null;
    private proxy: API<T>;


    constructor(data: Item<T>[], proxy: API<T>) {
        super();

        this.data = data;
        this.proxy = proxy;
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

        if (isComputed(value)) {
            return read(value);
        }

        return value;
    }

    dispatch<K extends keyof Events<T>, V>(event: K, value?: V) {
        if (this.listeners === null || this.listeners[event] === undefined) {
            return;
        }

        let listeners = this.listeners[event];

        for (let i = 0, n = listeners.length; i < n; i++) {
            let listener = listeners[i];

            if (listener === null) {
                continue;
            }

            try {
                listener(value);

                if (listener.once !== undefined) {
                    listeners[i] = null;
                }
            }
            catch {
                listeners[i] = null;
            }
        }
    }

    dispose() {
        let data = this.data;

        for (let i = 0, n = data.length; i < n; i++) {
            let value = data[i];

            if (isInstanceOf(value, Disposable)) {
                value.dispose();
            }
            else if (isComputed(value)) {
                dispose(value);
            }
        }

        this.listeners = null;
    }

    map<R>(
        fn: (this: API<T>, value: Value<T>, i: number) => R,
        i?: number,
        n?: number
    ) {
        let { data, proxy } = this,
            values: R[] = [];

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
                fn.call(
                    proxy,
                    (isComputed(item) ? item.value : item) as Value<T>,
                    i
                )
            );
        }

        return values;
    }

    on<K extends keyof Events<T>>(event: K, listener: Listener<Events<T>[K]>) {
        if (this.listeners === null) {
            this.listeners = { [event]: [listener] };
        }
        else {
            let listeners = this.listeners[event];

            if (listeners === undefined) {
                this.listeners[event] = [listener];
            }
            else if (listeners.indexOf(listener) === -1) {
                let i = listeners.indexOf(null);

                if (i === -1) {
                    listeners.push(listener);
                }
                else {
                    listeners[i] = listener;
                }
            }
        }
    }

    once<K extends keyof Events<T>>(event: K, listener: Listener<Events<T>[K]>) {
        listener.once = true;
        this.on(event, listener);
    }

    pop() {
        let item = this.data.pop();

        if (item !== undefined) {
            if (isComputed(item)) {
                dispose(item);
            }

            this.dispatch('pop', { item });
        }

        return item;
    }

    push(...input: T[]) {
        let items = factory(input),
            n = this.data.push(...items);

        this.dispatch('push', { items });

        return n;
    }

    reverse() {
        this.data.reverse();
        this.dispatch('reverse');

        return this;
    }

    shift() {
        let item = this.data.shift();

        if (item !== undefined) {
            if (isComputed(item)) {
                dispose(item);
            }

            this.dispatch('shift', { item });
        }

        return item;
    }

    sort(fn: (a: Value<T>, b: Value<T>) => number) {
        this.data.sort((a, b) => fn(
            (isComputed(a) ? a.value : a) as Value<T>,
            (isComputed(b) ? b.value : b) as Value<T>
        ));
        this.dispatch('sort');

        return this;
    }

    splice(start: number, deleteCount: number = this.data.length, ...input: T[]) {
        let items = factory(input),
            removed = this.data.splice(start, deleteCount, ...items);

        if (items.length > 0 || removed.length > 0) {
            for (let i = 0, n = removed.length; i < n; i++) {
                let item = removed[i];

                if (isComputed(item)) {
                    dispose(item);
                }
            }

            this.dispatch('splice', {
                deleteCount,
                items,
                start
            });
        }

        return removed;
    }

    unshift(...input: T[]) {
        let items = factory(input),
            length = this.data.unshift(...items);

        this.dispatch('unshift', { items });

        return length;
    }
}


function factory<T>(input: T[]) {
    let items: Item<T>[] = [];

    for (let i = 0, n = input.length; i < n; i++) {
        let value = input[i];

        if (isArray(value)) {
            items[i] = array(value);
        }
        else if (isFunction(value)) {
            items[i] = computed(value as Computed<T>['fn']);
        }
        else if (isObject(value)) {
            items[i] = object(value) as Item<T>;
        }
        else {
            items[i] = value;
        }
    }

    return items;
}


export default function array<T>(input: T[]) {
    let proxy = new Proxy({}, {
            get(_: any, key: any) {
                if (isNumber(key)) {
                    let value = wrapped[key];

                    if (isComputed(value)) {
                        return read(value);
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

                    if (host === undefined || !isComputed(host)) {
                        wrapped[key] = factory([value] as T[])[0];
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
        }) as API<T>,
        wrapped = factory(input);

    let a = new ReactiveArray(wrapped, proxy);

    return proxy;
};
export type { API as ReactiveArray };
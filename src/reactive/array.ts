import { dispose, signal, Reactive } from '~/signal';
import { Listener, Options, Signal } from '~/types';
import { isInstanceOf, isNumber, isObject } from '~/utilities';
import { ReactiveObject } from './object';


type Events<T> = {
    pop: {
        item: R<T>;
    };
    push: {
        items: R<T>[];
    };
    reverse: undefined;
    shift: {
        item: R<T>;
    };
    sort: undefined;
    splice: {
        deleteCount: number;
        items: R<T>[];
        start: number;
    };
    unshift: {
        items: R<T>[];
    };
};

type R<T> = Signal<T> | ReactiveObject< T extends Record<PropertyKey, unknown> ? { [K in keyof T]: T[K] } : never >;


let handler = {
        get(target: any, prop: any) {
            let value = target[prop];

            if (value === undefined) {
                return value;
            }

            if (isInstanceOf(value, Reactive)) {
                return value.get();
            }
            else if (supported.has(prop)) {
                return value;
            }

            throw new Error(`Reactivity: '${prop}' is not supported on reactive arrays`);
        },
        set(target: any, prop: any, value: any) {
            if (isNumber(prop)) {
                let host = target[prop];

                if (isInstanceOf(host, Reactive)) {
                    host.set(value);
                    return true;
                }

                return false;
            }

            return target[prop] = value;
        }
    },
    supported = new Set([
        'at',
        'dispatch', 'dispose',
        'length',
        'map',
        'on', 'once',
        'pop', 'push',
        'reverse',
        'self', 'shift', 'sort', 'splice',
        'unshift'
    ]);


function factory<T>(input: T[], options: Options = {}) {
    let items: R<T>[] = [];

    for (let i = 0, n = input.length; i < n; i++) {
        let value = input[i];

        if (isObject(value)) {
            items[i] = new ReactiveObject(value, options);
        }
        else {
            items[i] = signal(value);
        }
    }

    return items;
}


// REMINDER:
// - @ts-ignore flags are supressing type mismatch error
// - Input values are being transformed by this class into reactive values and back during get
class ReactiveArray<T> extends Array<R<T>> {
    private options: Options;
    // - Proxy binds itself to methods on get
    // - Use 'self' to avoid going through proxy for internal loops
    private self: ReactiveArray<T>;
    private signal: Signal<boolean>;


    constructor(data: R<T>[], options: Options = {}) {
        super(...data);
        this.options = options;
        this.self = this;
        this.signal = signal(false);
    }


    set length(n: number) {
        if (n > this.length) {
            return;
        }

        this.splice(n);
    }


    at(index: number) {
        let value = super.at(index);

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
        dispose(this.self as any);
    }

    // @ts-ignore
    map<U>(fn: (this: T[], value: T, i: number) => U) {
        let self = this.self,
            values: U[] = [];

        for (let i = 0, n = self.length; i < n; i++) {
            // @ts-ignore
            values.push( fn.call(this, self[i].value, i) );
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

    sort() {
        super.sort();
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


export default <T>(input: T[], options: Options = {}) => {
    return new Proxy(new ReactiveArray(factory(input, options)), handler);
};
export { ReactiveArray };
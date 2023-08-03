import { dispose } from '~/signal';
import { Listener, Object, Options, Signal } from '~/types';
import { ReactiveObject } from './object';


type Events<T> = {
    fill: { value: T };
    pop: { item: T };
    push: { items: T[] };
    reverse: undefined;
    shift: { item: T };
    sort: undefined;
    splice: { deleteCount: number, items: T[], start: number };
    unshift: { items: T[] };
};

type Node<T extends Object> = ReactiveObject<T>;


function factory<T extends Object>(data: T[], options: Options = {}) {
    let signals = [];

    for (let i = 0, n = data.length; i < n; i++) {
        signals.push( new ReactiveObject(data[i], options) );
    }

    return signals;
}

function unsupported(method: string): never {
    throw new Error(`Reactivity: '${method}' is not supported on reactive object array`);
}


// TODO:
// - patch method ( diff )
class ReactiveArray<T> extends Array<T> {
    #signal: Signal<boolean>;


    constructor(data: T[]) {
        super(...data);
        this.#signal = new Signal(false);
    }


    set length(n: number) {
        if (n > this.length) {
            return;
        }

        this.splice(n);
    }


    private trigger() {
        this.#signal.set(!this.#signal.value);
    }


    dispatch<E extends keyof Events<T>>(event: E, data?: Events<T>[E]) {
        this.#signal.dispatch(event, data);
    }

    dispose() {
        this.#signal.dispose();
    }

    fill(value: T, start?: number, end?: number) {
        super.fill(value, start, end);

        this.dispatch('fill', { value });
        this.trigger();

        return this;
    }

    on<E extends keyof Events<T>>(event: E, listener: Listener<Events<T>[E]>) {
        this.#signal.on(event, listener);
    }

    once<E extends keyof Events<T>>(event: E, listener: Listener<Events<T>[E]>) {
        this.#signal.once(event, listener);
    }

    pop() {
        let item = super.pop();

        if (item !== undefined) {
            this.dispatch('pop', { item });
            this.trigger();
        }

        return item;
    }

    push(...items: T[]) {
        let n = super.push(...items);

        this.dispatch('push', { items });
        this.trigger();

        return n;
    }

    reset() {
        this.#signal.reset();
    }

    reverse() {
        super.reverse();

        this.dispatch('reverse');
        this.trigger();

        return this;
    }

    shift() {
        let item = super.shift();

        if (item !== undefined) {
            this.dispatch('shift', { item });
            this.trigger();
        }

        return item;
    }

    sort() {
        super.sort();

        this.dispatch('sort');
        this.trigger();

        return this;
    }

    splice(start: number, deleteCount: number = super.length, ...items: T[]) {
        let removed = super.splice(start, deleteCount, ...items);

        if (items.length > 0 || removed.length > 0) {
            this.dispatch('splice', {
                deleteCount,
                items,
                start
            });
            this.trigger();
        }

        return removed;
    }

    track() {
        this.#signal.get();
    }

    unshift(...items: T[]) {
        let length = super.unshift(...items);

        this.dispatch('unshift', { items });
        this.trigger();

        return length;
    }
}


// REMINDER:
// - @ts-ignore flags are supressing a type mismatch error
// - Input values are being transformed by this class into nodes
class ReactiveObjectArray<T extends Object>  extends ReactiveArray<Node<T>> {
    #options: Options;


    constructor(data: T[], options: Options = {}) {
        super( factory(data, options) );
        this.#options = options;
    }


    fill() {
        return unsupported('fill');
    }

    reverse() {
        return unsupported('reverse');
    }

    pop() {
        return dispose(super.pop()) as Node<T> | undefined;
    }

    // @ts-ignore
    push(...values: T[]) {
        return super.push(...factory(values, this.#options));
    }

    shift() {
        return dispose(super.shift()) as Node<T> | undefined;
    }

    sort() {
        return unsupported('sort');
    }

    // @ts-ignore
    splice(start: number, deleteCount: number = super.length, ...values: T[]) {
        return dispose( super.splice(start, deleteCount, ...factory(values, this.#options)) );
    }

    // @ts-ignore
    unshift(...values: T[]) {
        return super.unshift(...factory(values, this.#options));
    }
}


export { ReactiveArray, ReactiveObjectArray };
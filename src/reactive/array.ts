import { isArray } from '@esportsplus/utilities';
import { PACKAGE_NAME, REACTIVE_ARRAY } from '../constants';
import { effect, read, root, signal, write } from '../system';
import { isReactiveObject } from './object';
import type { Signal } from '../types';


// One mutation as the batch event reports it: the matching event's payload, named by 'op'
type ArrayOp<T> =
    | { items: T[]; op: 'concat' }
    | { deleteCount: number; items: T[]; op: 'splice'; start: number }
    | { items: T[]; op: 'push' }
    | { index: number; item: T; op: 'set' }
    | { items: T[]; op: 'unshift' }
    | { op: 'clear' }
    | { item: T; op: 'pop' }
    | { op: 'reverse' }
    | { item: T; op: 'shift' }
    | { op: 'sort'; order: number[] };

type Events<T> = {
    // Every mutation of a task, in order, delivered once inside the reactivity pass that follows it (flush() settles
    // it); a clear drops the mutations before it
    batch: ArrayOp<T>[];
    clear: undefined,
    concat: {
        items: T[];
    };
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
    sort: {
        order: number[];
    };
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

type AnyListener<T> = Listener<Events<T>[keyof Events<T>]>;

type Listeners<T> = { [K in keyof Events<T>]?: (AnyListener<T> | null)[] };


function dispose(value: unknown) {
    if (isReactiveObject(value)) {
        (value as { dispose(): void }).dispose();
    }
}


// Derived arrays (splice removals, map/filter/slice) must be plain Arrays: species-creating a
// ReactiveArray runs the reactive constructor per call and seeds _length from the length argument.
class ReactiveArray<T> extends Array<T> {

    private _length: Signal<number>;

    // The batch listeners' delivery: the mutations not yet delivered, and the effect that delivers them
    private batched: { ops: ArrayOp<T>[] | null; stop: VoidFunction; tick: Signal<number> } | null = null;

    private delivering = false;

    listeners: Listeners<T> = {};


    constructor(items?: readonly T[]) {
        super();

        let n = items ? items.length : 0;

        for (let i = 0; i < n; i++) {
            this[i] = items![i];
        }

        this._length = signal(n);
    }


    static get [Symbol.species]() {
        return Array;
    }


    get $length() {
        return read(this._length);
    }

    set $length(value: number) {
        if (value > this.length) {
            throw Error(`@esportsplus/reactivity: cannot set length to a value larger than the current length, use splice instead.`);
        }

        this.splice(value, this.length);
    }


    $set(i: number, value: T) {
        let prev = this[i];

        if (prev === value) {
            return;
        }

        let length = this.length;

        this[i] = value;

        if (i >= length) {
            write(this._length, i + 1);
        }

        this.dispatch('set', { index: i, item: value });
        this.record({ index: i, item: value, op: 'set' });
        dispose(prev);
    }


    // Starts delivering batches: an effect of its own, outside any owner, since the array outlives whoever listens
    private batch() {
        let tick = signal(0);

        this.batched = {
            ops: null,
            stop: root(() => effect(() => {
                read(tick);

                let batched = this.batched,
                    ops = batched?.ops;

                if (!ops) {
                    return;
                }

                batched!.ops = null;
                this.delivering = true;

                try {
                    // What listeners build belongs to them, not to this effect
                    root(() => this.dispatch('batch', ops));
                }
                finally {
                    this.delivering = false;
                }

                // Disposing this effect inside its own run corrupts its dependency links, so the stop waits for the
                // run to end; a listener that joins meanwhile keeps it
                if (this.listeners.batch === undefined) {
                    queueMicrotask(() => {
                        if (this.listeners.batch === undefined) {
                            this.unbatch();
                        }
                    });
                }
            })),
            tick
        };
    }

    // Trims trailing empty slots; an event left with no listeners is deleted, so e.g. sort() skips computing its order
    private prune<K extends keyof Events<T>>(event: K, listeners: (AnyListener<T> | null)[]) {
        while (listeners.length && listeners[listeners.length - 1] === null) {
            listeners.pop();
        }

        if (listeners.length === 0 && this.listeners[event] === listeners) {
            delete this.listeners[event];
        }
    }

    private record(op: ArrayOp<T>) {
        let batched = this.batched;

        if (batched === null) {
            return;
        }

        if (op.op === 'clear' || batched.ops === null) {
            batched.ops = [op];
        }
        else {
            batched.ops.push(op);
        }

        write(batched.tick, batched.tick.value + 1);
    }

    private unbatch() {
        let batched = this.batched;

        if (batched !== null) {
            this.batched = null;
            batched.stop();
        }
    }


    clear() {
        this.dispose();
        write(this._length, 0);
        this.dispatch('clear');
        this.record({ op: 'clear' });
    }

    concat(...items: ConcatArray<T>[]): ReactiveArray<T>;
    concat(...items: (T | ConcatArray<T>)[]): ReactiveArray<T>;
    concat(...items: (T | ConcatArray<T>)[]) {
        let added: T[] = [];

        for (let i = 0, n = items.length; i < n; i++) {
            let item = items[i];

            if (isArray(item)) {
                for (let j = 0, o = item.length; j < o; j++) {
                    added.push(item[j]);
                    super.push(item[j]);
                }
            }
            else {
                added.push(item as T);
                super.push(item as T);
            }
        }

        if (added.length) {
            write(this._length, this.length);
            this.dispatch('concat', { items: added });
            this.record({ items: added, op: 'concat' });
        }

        return this;
    }

    dispatch<K extends keyof Events<T>>(event: K, value?: Events<T>[K]) {
        let listeners = this.listeners[event];

        if (!listeners) {
            return;
        }

        let dirty = false,
            errors: unknown[] | null = null;

        // n is fixed: a listener unsubscribed mid-dispatch leaves a null (or, once trimmed, a missing) slot
        for (let i = 0, n = listeners.length; i < n; i++) {
            let listener = listeners[i];

            if (listener == null) {
                continue;
            }

            try {
                listener(value as Events<T>[K]);

                if (listener.once !== undefined) {
                    dirty = true;
                    listeners[i] = null;
                }
            }
            catch (e) {
                dirty = true;
                listeners[i] = null;
                (errors ??= []).push(e);
            }
        }

        if (dirty) {
            this.prune(event, listeners);
        }

        if (event === 'batch' && !this.delivering && this.listeners.batch === undefined) {
            this.unbatch();
        }

        if (errors !== null) {
            let error = errors.length === 1
                ? errors[0]
                : new AggregateError(errors, `${PACKAGE_NAME}: dispatch produced multiple errors`);

            queueMicrotask(() => {
                throw error;
            });
        }
    }

    dispose() {
        while (this.length) {
            dispose(super.pop());
        }

        write(this._length, 0);
    }

    // Returns the unsubscribe. A listener already registered for the event is not added twice, and either
    // registration's unsubscribe removes it.
    on<K extends keyof Events<T>>(event: K, listener: Listener<Events<T>[K]>): VoidFunction {
        let entry = listener as AnyListener<T>,
            listeners = this.listeners[event];

        if (event === 'batch' && this.batched === null) {
            this.batch();
        }

        if (listeners === undefined) {
            this.listeners[event] = [entry];
        }
        else {
            let hole = listeners.length,
                registered = false;

            for (let i = 0, n = hole; i < n; i++) {
                let l = listeners[i];

                if (l === entry) {
                    registered = true;
                    break;
                }
                else if (l === null && hole === n) {
                    hole = i;
                }
            }

            if (!registered) {
                listeners[hole] = entry;
                this.prune(event, listeners);
            }
        }

        return () => {
            let current = this.listeners[event];

            if (current === undefined) {
                return;
            }

            let i = current.indexOf(entry);

            if (i !== -1) {
                current[i] = null;
                this.prune(event, current);
            }

            if (event === 'batch' && !this.delivering && this.listeners.batch === undefined) {
                this.unbatch();
            }
        };
    }

    once<K extends keyof Events<T>>(event: K, listener: Listener<Events<T>[K]>): VoidFunction {
        listener.once = true;

        return this.on(event, listener);
    }

    pop() {
        if (this.length === 0) {
            return undefined;
        }

        let item = super.pop() as T;

        dispose(item);
        write(this._length, this.length);
        this.dispatch('pop', { item });
        this.record({ item, op: 'pop' });

        return item;
    }

    push(...items: T[]) {
        if (!items.length) {
            return this.length;
        }

        let length = super.push(...items);

        write(this._length, length);

        this.dispatch('push', { items });
        this.record({ items, op: 'push' });

        return length;
    }

    reverse() {
        super.reverse();
        this.dispatch('reverse');
        this.record({ op: 'reverse' });

        return this;
    }

    shift() {
        if (this.length === 0) {
            return undefined;
        }

        let item = super.shift() as T;

        dispose(item);
        write(this._length, this.length);
        this.dispatch('shift', { item });
        this.record({ item, op: 'shift' });

        return item;
    }

    sort(fn?: (a: T, b: T) => number) {
        if (this.listeners.sort === undefined && this.batched === null) {
            super.sort(fn);
        }
        else {
            let n = this.length,
                before = new Array(n) as T[];

            for (let i = 0; i < n; i++) {
                before[i] = this[i];
            }

            super.sort(fn);

            let buckets = new Map<T, { indices: number[]; next: number }>(),
                order = new Array(n);

            for (let i = 0; i < n; i++) {
                let value = before[i],
                    bucket = buckets.get(value);

                if (bucket === undefined) {
                    buckets.set(value, { indices: [i], next: 0 });
                }
                else {
                    bucket.indices.push(i);
                }
            }

            for (let i = 0; i < n; i++) {
                let bucket = buckets.get(this[i])!;

                order[i] = bucket.indices[bucket.next++];
            }

            this.dispatch('sort', { order });
            this.record({ op: 'sort', order });
        }

        return this;
    }

    splice(start: number, deleteCount: number = this.length, ...items: T[]) {
        let length = this.length,
            removed = super.splice(start, deleteCount, ...items);

        if (items.length > 0 || removed.length > 0) {
            write(this._length, this.length);

            for (let i = 0, n = removed.length; i < n; i++) {
                dispose(removed[i]);
            }

            // Listeners receive the position and count Array.prototype.splice actually applied
            // (negative, fractional and out-of-range arguments resolved), never the raw arguments
            let index = Math.trunc(start) || 0,
                resolved = index < 0 ? Math.max(length + index, 0) : Math.min(index, length);

            this.dispatch('splice', { deleteCount: removed.length, items, start: resolved });
            this.record({ deleteCount: removed.length, items, op: 'splice', start: resolved });
        }

        return removed;
    }

    unshift(...items: T[]) {
        if (!items.length) {
            return this.length;
        }

        let length = super.unshift(...items);

        write(this._length, length);
        this.dispatch('unshift', { items });
        this.record({ items, op: 'unshift' });

        return length;
    }
}

Object.defineProperty(ReactiveArray.prototype, REACTIVE_ARRAY, { value: true });


export { ReactiveArray };
export type { ArrayOp };

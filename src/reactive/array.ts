import { isArray } from '@esportsplus/utilities';
import { read, signal, write } from '~/system';
import { REACTIVE_ARRAY, REACTIVE_OBJECT } from '~/constants';
import type { Signal } from '~/types';


type Events<T> = {
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

type Listeners = Record<string, (Listener<any> | null)[]>;


function dispose(value: unknown) {
    if (value !== null && typeof value === 'object' && (value as any)[REACTIVE_OBJECT] === true) {
        (value as { dispose(): void }).dispose();
    }
}


class ReactiveArray<T> extends Array<T> {
    private _length: Signal<number>;

    listeners: Listeners = {};


    constructor(...items: T[]) {
        super(...items);
        this._length = signal(items.length);
    }


    $length() {
        return read(this._length);
    }

    $set(i: number, value: T) {
        let prev = this[i];

        if (prev === value) {
            return;
        }

        this[i] = value;

        if (i >= super.length) {
            write(this._length, i + 1);
        }

        this.dispatch('set', { index: i, item: value });
    }

    clear() {
        this.dispose();
        write(this._length, 0);
        this.dispatch('clear');
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
            write(this._length, super.length);
            this.dispatch('concat', { items: added });
        }

        return this;
    }

    dispatch<K extends keyof Events<T>, V>(event: K, value?: V) {
        let listeners = this.listeners[event];

        if (!listeners) {
            return;
        }

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

        while (listeners.length && listeners[listeners.length - 1] === null) {
            listeners.pop();
        }
    }

    dispose() {
        while (this.length) {
            dispose(super.pop());
        }

        write(this._length, 0);
    }

    on<K extends keyof Events<T>>(event: K, listener: Listener<Events<T>[K]>) {
        let listeners = this.listeners[event];

        if (listeners === undefined) {
            this.listeners[event] = [listener];
        }
        else {
            let hole = listeners.length;

            for (let i = 0, n = hole; i < n; i++) {
                let l = listeners[i];

                if (l === listener) {
                    return;
                }
                else if (l === null && hole === n) {
                    hole = i;
                }
            }

            listeners[hole] = listener;

            while (listeners.length && listeners[listeners.length - 1] === null) {
                listeners.pop();
            }
        }
    }

    once<K extends keyof Events<T>>(event: K, listener: Listener<Events<T>[K]>) {
        listener.once = true;
        this.on(event, listener);
    }

    pop() {
        let item = super.pop();

        if (item !== undefined) {
            dispose(item);
            write(this._length, super.length);

            this.dispatch('pop', { item });
        }

        return item;
    }

    push(...items: T[]) {
        if (!items.length) {
            return super.length;
        }

        let length = super.push(...items);

        write(this._length, length);
        this.dispatch('push', { items });

        return length;
    }

    reverse() {
        super.reverse();
        this.dispatch('reverse');

        return this;
    }

    shift() {
        let item = super.shift();

        if (item !== undefined) {
            dispose(item);
            write(this._length, super.length);

            this.dispatch('shift', { item });
        }

        return item;
    }

    sort(fn?: (a: T, b: T) => number) {
        let before = new Array(this.length) as T[];

        for (let i = 0, n = before.length; i < n; i++) {
            before[i] = this[i];
        }

        super.sort(fn);

        let buckets = new Map<any, number[]>(),
            cursors = new Map<any, number>(),
            order = new Array(this.length);

        for (let i = 0, n = before.length; i < n; i++) {
            let value = before[i],
                list = buckets.get(value);

            if (!list) {
                buckets.set(value, [i]);
            }
            else {
                list.push(i);
            }
        }

        for (let i = 0, n = this.length; i < n; i++) {
            let value = this[i],
                list = buckets.get(value);

            if (!list) {
                order[i] = i;
                continue;
            }

            let cursor = cursors.get(value) || 0;

            order[i] = list[cursor];
            cursors.set(value, cursor + 1);
        }

        this.dispatch('sort', { order });

        return this;
    }

    splice(start: number, deleteCount: number = this.length, ...items: T[]) {
        let removed = super.splice(start, deleteCount, ...items);

        if (items.length > 0 || removed.length > 0) {
            write(this._length, super.length);

            for (let i = 0, n = removed.length; i < n; i++) {
                dispose(removed[i]);
            }

            this.dispatch('splice', { deleteCount, items, start });
        }

        return removed;
    }

    unshift(...items: T[]) {
        let length = super.unshift(...items);

        write(this._length, length);
        this.dispatch('unshift', { items });

        return length;
    }
}

Object.defineProperty(ReactiveArray.prototype, REACTIVE_ARRAY, { value: true });


export { ReactiveArray };

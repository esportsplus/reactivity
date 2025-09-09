import { REACTIVE_ARRAY } from '~/constants';
import { read, set, signal } from '~/system';
import { isReactiveObject } from './object';


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


class ReactiveArray<T> extends Array<T> {
    [REACTIVE_ARRAY] = true;
    listeners: Listeners = {};
    trigger = signal(false);


    constructor(...items: T[]) {
        super(...items);
    }


    get length() {
        read(this.trigger);

        return super.length;
    }

    set length(n: number) {
        super.length = n;
        set(this.trigger, !this.trigger.value);
    }


    clear() {
        this.dispose();
        this.dispatch('clear');
        set(this.trigger, !this.trigger.value);
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
    }

    dispose() {
        let item;

        while (item = super.pop()) {
            if (isReactiveObject(item)) {
                item.dispose();
            }
        }
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
        }
    }

    once<K extends keyof Events<T>>(event: K, listener: Listener<Events<T>[K]>) {
        listener.once = true;
        this.on(event, listener);
    }

    pop() {
        let item = super.pop();

        if (item !== undefined) {
            if (isReactiveObject(item)) {
                item.dispose();
            }
            this.dispatch('pop', { item });
            set(this.trigger, !this.trigger.value);
        }

        return item;
    }

    push(...items: T[]) {
        let length = super.push(...items);

        this.dispatch('push', { items });
        set(this.trigger, !this.trigger.value);

        return length;
    }

    reverse() {
        super.reverse();
        this.dispatch('reverse');
        set(this.trigger, !this.trigger.value);

        return this;
    }

    shift() {
        let item = super.shift();

        if (item !== undefined) {
            if (isReactiveObject(item)) {
                item.dispose();
            }
            this.dispatch('shift', { item });
            set(this.trigger, !this.trigger.value);
        }

        return item;
    }

    sort(fn: (a: T, b: T) => number) {
        super.sort(fn);
        this.dispatch('sort');
        set(this.trigger, !this.trigger.value);

        return this;
    }

    splice(start: number, deleteCount: number = this.length, ...items: T[]) {
        let removed = super.splice(start, deleteCount, ...items);

        if (items.length > 0 || removed.length > 0) {
            for (let i = 0, n = removed.length; i < n; i++) {
                let item = removed[i];

                if (isReactiveObject(item)) {
                    item.dispose();
                }
            }

            this.dispatch('splice', { deleteCount, items, start });
            set(this.trigger, !this.trigger.value);
        }

        return removed;
    }

    unshift(...items: T[]) {
        let length = super.unshift(...items);

        this.dispatch('unshift', { items });
        set(this.trigger, !this.trigger.value);

        return length;
    }
}


export { ReactiveArray };

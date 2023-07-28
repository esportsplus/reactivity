import { CHECK, CLEAN, COMPUTED, DIRTY, DISPOSED, EFFECT, SIGNAL } from './constants';
import { Changed, Computed, Effect, Event, Listener, NeverAsync, Options, Root, Scheduler, State, Type } from './types';
import { isArray } from './utilities';


let index = 0,
    observer: Signal<any> | null = null,
    observers: Signal<any>[] | null = null,
    scope: Root | null = null;


class Signal<T> {
    changed: Changed | null = null;
    fn: Computed<T>['fn'] | Effect['fn'] | null = null;
    listeners: Record<Event, (Listener<any> | null)[]> | null = null;
    observers: Signal<T>[] | null = null;
    root: Root | null = null;
    sources: Signal<T>[] | null = null;
    state: State;
    task: Parameters<Scheduler>[0] | null = null;
    type: Type;
    updating: boolean | null = null;
    value: T;


    constructor(data: T, state: Signal<T>['state'], type: Signal<T>['type'], options: Options = {}) {
        if (options.changed !== undefined) {
            this.changed = options.changed;
        }

        this.state = state;
        this.type = type;
        this.value = data;
    }


    dispatch<D>(event: Event, data?: D) {
        if (this.listeners === null || !(event in this.listeners)) {
            return;
        }

        let listeners = this.listeners[event],
            value = this.value;

        for (let i = 0, n = listeners.length; i < n; i++) {
            let listener = listeners[i];

            if (listener === null) {
                continue;
            }

            try {
                // @ts-ignore
                listener( listener.length === 0 ? null : { data, value } );
            }
            catch {
                listeners[i] = null;
            }

            if (listener.once !== undefined) {
                listeners[i] = null;
            }
        }
    }

    dispose() {
        if (this.state === DISPOSED) {
            return;
        }

        this.state = DISPOSED;

        this.dispatch('dispose', this);
        flush(this);
    }

    on(event: Event, listener: Listener<any>) {
        if (this.updating) {
            listener.once = true;
        }

        if (this.listeners === null || !(event in this.listeners)) {
            this.listeners ??= {};
            this.listeners[event] = [listener];
        }
        else {
            let listeners = this.listeners[event];

            if (listeners.indexOf(listener) === -1) {
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

    once(event: Event, listener: Listener<any>) {
        listener.once = true;
        this.on(event, listener);
    }

    reset() {
        this.dispatch('reset', this);
        flush(this);

        if (this.type === COMPUTED) {
            this.state = DIRTY;
            this.value = undefined as T;
        }
        else if (this.type === EFFECT) {
            this.state = DIRTY;
            update(this);
        }
        else if (this.type === SIGNAL) {
            this.state = CLEAN;
        }
    }
}


function changed(a: unknown, b: unknown) {
    return a !== b;
}

function flush<T>(node: Signal<T>) {
    if (node.sources !== null) {
        removeSourceObservers(node, 0);
    }

    node.listeners = null;
    node.observers = null;
    node.sources = null;
}

function notify<T>(nodes: Signal<T>[] | null, state: typeof CHECK | typeof DIRTY) {
    if (nodes === null) {
        return;
    }

    for (let i = 0, n = nodes.length; i < n; i++) {
        let node = nodes[i];

        if (node.state < state) {
            if (node.type === EFFECT && node.state === CLEAN) {
                node.root!.scheduler(node.task!);
            }

            node.state = state;
            notify(node.observers, CHECK);
        }
    }
}

function removeSourceObservers<T>(node: Signal<T>, start: number) {
    if (node.sources === null) {
        return;
    }

    for (let i = start, n = node.sources.length; i < n; i++) {
        let source = node.sources[i];

        if (source.observers === null) {
            continue;
        }

        source.observers[source.observers.indexOf(node)] = source.observers[source.observers.length - 1];
        source.observers.pop();
    }
}

function sync<T>(node: Signal<T>) {
    if (node.state === CHECK && node.sources !== null) {
        for (let i = 0, n = node.sources.length; i < n; i++) {
            sync(node.sources[i]);

            // Stop the loop here so we won't trigger updates on other parents unnecessarily
            // If our computation changes to no longer use some sources, we don't
            // want to update() a source we used last time, but now don't use.
            if ((node.state as State) === DIRTY) {
                break;
            }
        }
    }

    if (node.state === DIRTY) {
        update(node);
    }
    else {
        node.state = CLEAN;
    }
}

function update<T>(node: Signal<T>) {
    let i = index,
        o = observer,
        os = observers;

    index = 0;
    observer = node;
    observers = null as typeof observers;

    try {
        node.dispatch('update');
        node.updating = true;

        let value = (
                node as typeof node extends Effect ? Effect : Computed<T>
            ).fn.call(node, node.value);

        node.updating = null;

        if (observers) {
            removeSourceObservers(node, index);

            if (node.sources !== null && index > 0) {
                node.sources.length = index + observers.length;

                for (let i = 0, n = observers.length; i < n; i++) {
                    node.sources[index + i] = observers[i];
                }
            }
            else {
                node.sources = observers;
            }

            for (let i = index, n = node.sources.length; i < n; i++) {
                let source = node.sources[i];

                if (!source.observers) {
                    source.observers = [node];
                }
                else {
                    source.observers.push(node);
                }
            }
        }
        else if (node.sources !== null && index < node.sources.length) {
            removeSourceObservers(node, index);
            node.sources.length = index;
        }

        if (node.type === COMPUTED) {
            write(node, value);
        }
    }
    catch {
        if (node.state === DIRTY) {
            removeSourceObservers(node, 0);
        }
    }
    finally {
        index = i;
        observer = o;
        observers = os;
    }

    node.state = CLEAN;
}


const computed = <T>(fn: Computed<T>['fn'], options: Options = {}) => {
    let node = new Signal(options.value as T, DIRTY, COMPUTED, options) as Computed<T>;

    node.fn = fn;

    return node;
};

const dispose = <T extends { dispose: () => void }>(dispose?: T[] | T) => {
    if (dispose === undefined) {
    }
    else if (isArray(dispose)) {
        for (let i = 0, n = dispose.length; i < n; i++) {
            dispose[i].dispose();
        }
    }
    else {
        dispose.dispose();
    }

    return dispose;
};

const effect = (fn: Effect['fn'], options: Omit<Options, 'value'> = {}) => {
    let node = new Signal(void 0, DIRTY, EFFECT, options) as Effect;

    if (scope !== null) {
        node.root = scope;
    }
    else if (observer !== null && observer.type === EFFECT && observer.root !== null) {
        node.root = observer.root;
    }
    else {
        throw new Error('Reactivity: `effects` cannot be created without a reactive root');
    }

    node.fn = fn;
    node.task = () => read(node);

    read(node);

    return node;
};

const read = <T>(node: Signal<T>): typeof node['value'] => {
    if (node.state === DISPOSED) {
        return node.value;
    }

    if (observer !== null) {
        if (observers === null) {
            if (observer.sources !== null && observer.sources[index] == node) {
                index++;
            }
            else {
                observers = [node];
            }
        }
        else {
            observers.push(node);
        }
    }

    if (node.fn !== null) {
        sync(node);
    }

    return node.value;
};

const reset = <T extends { reset: () => void }>(reset?: T[] | T) => {
    if (reset === undefined) {
    }
    else if (isArray(reset)) {
        for (let i = 0, n = reset.length; i < n; i++) {
            reset[i].reset();
        }
    }
    else {
        reset.reset();
    }

    return reset;
};

function root<T>(fn: () => NeverAsync<T>, properties?: Root) {
    let o = observer,
        s = scope;

    if (properties === undefined) {
        if (scope === null) {
            throw new Error('Reactivity: `root` cannot be created without a task scheduler');
        }

        properties = scope;
    }

    observer = null;
    scope = properties;

    let result = fn();

    observer = o;
    scope = s;

    return result;
};

const signal = <T>(data: T, options: Omit<Options, 'value'> = {}) => {
    return new Signal(data, CLEAN, SIGNAL, options);
};

const write = <T>(node: Signal<T>, value: unknown) => {
    if ((node.changed === null ? changed : node.changed)(node.value, value)) {
        node.value = value as T;
        notify(node.observers, DIRTY);
    }

    return node.value;
};


export default Signal;
export { computed, dispose, effect, read, reset, root, signal, write };
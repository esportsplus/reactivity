import { assign } from './context';
import { CHECK, CLEAN, COMPUTED, DIRTY, DISPOSED, DISPOSE, EFFECT, RESET, SIGNAL, UPDATE } from '~/symbols';
import { Computed, Effect, Event, Listener, Options, Root, Scheduler, State } from '~/types';
import Signal from './signal';


let index = 0,
    observer: Signal<any> | null = null,
    observers: Signal<any>[] | null = null,
    scope: Root | null = null;


function changed(a: unknown, b: unknown) {
    return a !== b;
}

function dispatch<T>(event: Event, node: Signal<T>) {
    if (!node.listeners?.[event]) {
        return;
    }

    let listeners = node.listeners[event],
        value = node.value;

    for (let i = 0, n = listeners.length; i < n; i++) {
        let listener = listeners[i];

        if (!listener) {
            continue;
        }

        listener(value);

        if (listener?.once) {
            listeners[i] = null;
        }
    }
}

function flush<T>(node: Signal<T>) {
    if (node.sources) {
        removeSourceObservers(node, 0);
    }

    node.listeners = null;
    node.observers = null;
    node.sources = null;
}

function notify<T>(nodes: Signal<T>[] | null, state: typeof CHECK | typeof DIRTY) {
    if (!nodes) {
        return;
    }

    for (let i = 0, n = nodes.length; i < n; i++) {
        let node = nodes[i];

        if (node.state < state) {
            if (node.type === EFFECT && node.state === CLEAN) {
                (node as Effect<T>).root.scheduler((node as Effect<T>).task);
            }

            node.state = state;
            notify(node.observers, CHECK);
        }
    }
}

function removeSourceObservers<T>(node: Signal<T>, start: number) {
    if (!node.sources) {
        return;
    }

    for (let i = start, n = node.sources.length; i < n; i++) {
        let source = node.sources[i];

        if (!source?.observers) {
            continue;
        }

        source.observers[source.observers.indexOf(node)] = source.observers[source.observers.length - 1];
        source.observers.pop();
    }
}

function sync<T>(node: Signal<T>) {
    if (node.state === CHECK && node.sources) {
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
        dispatch(UPDATE, node);

        node.updating = true;

        let value = node.fn!.call(node.context!, node?.value);

        node.updating = null;

        if (observers) {
            removeSourceObservers(node, index);

            if (node.sources && index > 0) {
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
        else if (node.sources && index < node.sources.length) {
            removeSourceObservers(node, index);
            node.sources.length = index;
        }

        if (node.type === COMPUTED) {
            // TODO: If async write value after then
            write(node, value);
        }
    }
    catch {
        if (node.state === DIRTY) {
            removeSourceObservers(node, 0);
        }
        return;
    }
    finally {
        index = i;
        observer = o;
        observers = os;
    }

    node.state = CLEAN;
}


const computed = <T>(fn: Computed<T>['fn'], options: Options = {}) => {
    let node = new Signal(undefined as any, DIRTY, COMPUTED, options);

    node.context = assign({} as Record<PropertyKey, unknown>, node);
    node.fn = fn;

    return node as Computed<T>;
};

const dispose = <T>(node: Signal<T>) => {
    if (node.state === DISPOSED) {
        return;
    }

    node.state = DISPOSED;

    dispatch(DISPOSE, node);
    flush(node);
};

const effect = <T>(fn: Effect<T>['fn'], options: Options = {}) => {
    if (!scope) {
        throw new Error('Reactivity: `effects` cannot be created without a reactive root');
    }

    let node = new Signal(undefined as any, DIRTY, EFFECT, options);

    node.context = assign({} as Record<PropertyKey, unknown>, node);
    node.fn = fn;
    node.root = scope;
    node.task = () => read(node);

    update(node);

    return node as Effect<T>;
};

const on = <T>(event: Event, listener: Listener, node: Signal<T>) => {
    if (node.updating) {
        listener.once = true;
    }

    if (!node.listeners?.[event]) {
        node.listeners ??= {};
        node.listeners[event] = [listener];
    }
    else {
        let listeners = node.listeners[event];

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
};

const once = <T>(event: Event, listener: Listener, node: Signal<T>) => {
    listener.once = true;
    on(event, listener, node);
};

const read = <T>(node: Signal<T>): typeof node['value'] => {
    if (node.state === DISPOSED) {
        return node.value;
    }

    if (observer) {
        if (!observers) {
            if (observer?.sources?.[index] == node) {
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

    if (node.fn) {
        sync(node);
    }

    return node.value;
};

const reset = <T>(node: Signal<T>) => {
    dispatch(RESET, node);
    flush(node);

    if (node.type === COMPUTED) {
        node.state = DIRTY;
        node.value = undefined as T;
    }
    else if (node.type === EFFECT) {
        node.state = DIRTY;
        update(node);
    }
    else if (node.type === SIGNAL) {
        node.state = CLEAN;
    }
};

const root = <T>(fn: () => T, properties: { scheduler?: Scheduler } = {}) => {
    let o = observer,
        s = scope;

    properties.scheduler = properties?.scheduler || scope?.scheduler;

    if (!properties.scheduler) {
        throw new Error('Reactivity: `root` cannot be created without a task scheduler');
    }

    observer = null;
    scope = properties as Root;

    let result = fn();

    observer = o;
    scope = s;

    return result;
};

const signal = <T>(data: T, options: Options = {}) => {
    return new Signal(data, CLEAN, SIGNAL, options);
};

const write = <T>(node: Signal<T>, value: unknown) => {
    if ((node?.changed || changed)(node.value, value)) {
        node.value = value as T;
        notify(node.observers, DIRTY);
    }

    return node.value;
};


export default { computed, dispose, effect, on, once, read, reset, root, signal, write };
export { computed, dispose, effect, on, once, read, reset, root, signal, write };
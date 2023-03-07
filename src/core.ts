import { CHECK, CLEAN, COMPUTED, DIRTY, DISPOSED, DISPOSE, EFFECT, RESET, SIGNAL, UPDATE } from './symbols';
import { Computed, Effect, Fn, Listener, Options, Root, Scheduler } from './types';
import Signal from './signal';


let index = 0,
    observer: Signal | null = null,
    observers: Signal[] | null = null,
    scope: Root | null = null;


function changed(a: unknown, b: unknown) {
    return a !== b;
}

function notify(nodes: Signal[], state: typeof CHECK | typeof DIRTY) {
    for (let i = 0, n = nodes.length; i < n; i++) {
        let node = nodes[i];

        if (node.state < state) {
            if (node.type === EFFECT && node.state === CLEAN) {
                (node as Effect).root.scheduler((node as Effect).task);
            }

            node.state = state;

            if (node.observers) {
                notify(node.observers, CHECK);
            }
        }
    }
}

function removeSourceObservers(node: Signal, start: number) {
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

function sync(node: Signal) {
    if (node.state === CHECK && node.sources) {
        for (let i = 0, n = node.sources.length; i < n; i++) {
            sync(node.sources[i]);

            // Stop the loop here so we won't trigger updates on other parents unnecessarily
            // If our computation changes to no longer use some sources, we don't
            // want to update() a source we used last time, but now don't use.
            if ((node.state as Signal['state']) === DIRTY) {
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

function update(node: Signal) {
    let i = index,
        o = observer,
        os = observers;

    index = 0;
    observer = node;
    observers = null as typeof observers;

    try {
        if (node.listeners) {
            dispatch(UPDATE, node);
        }

        let value = node.fn!.call( node.context );

        if (observers) {
            if (node.sources) {
                removeSourceObservers(node, index);
            }

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
            write(node, value);
        }
    }
    catch {
        if (node.state === DIRTY && node.sources) {
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


const computed = <T>(fn: Fn<T>, options: Options = {}) => {
    let node = new Signal(undefined as unknown, DIRTY, COMPUTED, options);

    node.fn = fn;

    return node as Computed;
};

const dispose = (node: Signal) => {
    if (node.state === DISPOSED) {
        return;
    }

    node.state = DISPOSED;

    if (node.listeners) {
        dispatch(DISPOSE, node);
    }

    if (node.sources) {
        removeSourceObservers(node, 0);
    }

    node.observers = null;
    node.sources = null;
};

const effect = <T>(fn: Fn<T>, options: Options = {}) => {
    if (!scope) {
        throw new Error('Reactivity: effects cannot be created without a reactive root');
    }

    let node = new Signal(undefined as unknown, DIRTY, EFFECT, options);

    node.fn = fn;
    node.root = scope;
    node.task = () => read(node);

    update(node);

    return node as Effect;
};

const dispatch = (event: symbol, node: Signal) => {
    if (!node.listeners?.[event]) {
        return;
    }

    let listeners = node.listeners[event],
        value = node.value;

    for (let i = 0, n = listeners.length; i < n; i++) {
        listeners[i](value);
    }

    node.listeners = null;
};

const on = (event: symbol, listener: Listener, node: Signal) => {
    if (!node.listeners?.[event]) {
        node.listeners ??= {};
        node.listeners[event] = [listener];
    }
    else {
        node.listeners[event].push(listener);
    }
};

const read = (node: Signal): typeof node['value'] => {
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

const reset = (node: Signal) => {
    if (node.listeners) {
        dispatch(RESET, node);
    }

    if (node.sources) {
        removeSourceObservers(node, 0);
    }

    node.observers = null;
    node.sources = null;

    if (node.type === COMPUTED) {
        node.state = DIRTY;
        node.value = undefined;
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
        throw new Error('Reactivity: root cannot be created without a task scheduler');
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

const write = (node: Signal, value: unknown) => {
    if ((node?.changed || changed)(node.value, value)) {
        node.value = value;

        if (node.observers) {
            notify(node.observers, DIRTY);
        }
    }

    return node.value;
};


export default { computed, dispatch, dispose, effect, on, read, reset, root, signal, write };
export { computed, dispatch, dispose, effect, on, read, reset, root, signal, write };
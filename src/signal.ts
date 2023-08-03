import { CHECK, CLEAN, COMPUTED, DIRTY, DISPOSED, EFFECT, ROOT, SIGNAL } from './constants';
import { Changed, Event, Function, Listener, NeverAsync, Options, Scheduler, State, Type } from './types';
import { isArray } from './utilities';


let index = 0,
    observer: Core<any> | null = null,
    observers: Core<any>[] | null = null,
    scope: Root | null = null;


class Core<T> {
    listeners: Record<Event, (Listener<any> | null)[]> | null = null;
    observers: Core<any>[] | null = null;
    root: Root | null;
    sources: Core<any>[] | null = null;
    state: State;
    updating: boolean = false;
    value: T;


    constructor(state: State, value: T) {
        let root = null;

        if (this.type !== ROOT) {
            if (scope !== null) {
                root = scope;
            }
            else if (observer !== null) {
                root = observer.root;
            }

            if (root == null) {
                if (this.type === EFFECT) {
                    throw new Error(`Reactivity: 'effect' cannot be created without a reactive root`);
                }
            }
            else if (root.tracking) {
                root.on('dispose', () => this.dispose());
            }
        }

        this.root = root;
        this.state = state;
        this.value = value;
    }


    get type(): Type | never {
        throw new Error(`Reactivity: reactive primitives require 'type' getters`);
    }


    dispatch<D>(event: Event, data?: D) {
        if (this.listeners === null || this.listeners[event] === undefined) {
            return;
        }

        let listeners = this.listeners[event],
            parameter = {
                data,
                value: this.value
            };

        for (let i = 0, n = listeners.length; i < n; i++) {
            let listener = listeners[i];

            if (listener === null) {
                continue;
            }

            try {
                listener(parameter);

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
        if (this.state === DISPOSED) {
            return;
        }

        this.dispatch('dispose', this);

        removeSourceObservers(this, 0);

        this.listeners = null;
        this.observers = null;
        this.sources = null;
        this.state = DISPOSED;
    }

    on<T>(event: Event, listener: Listener<T>) {
        if (this.updating) {
            listener.once = true;
        }

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

    once<T>(event: Event, listener: Listener<T>) {
        listener.once = true;
        this.on(event, listener);
    }
}

class Computed<T> extends Core<T> {
    changed: Changed;
    fn: NeverAsync<() => T>;


    constructor(fn: Computed<T>['fn'], options?: Options) {
        super(DIRTY, undefined as T);
        this.changed = options?.changed || changed;
        this.fn = fn;
    }


    get type(): Type {
        return COMPUTED;
    }


    get() {
        return read(this);
    }
}

class Effect extends Core<null> {
    fn: NeverAsync<(node: Effect) => void>;
    task: Function;


    constructor(fn: Effect['fn']) {
        super(DIRTY, null);
        this.fn = fn;
        this.task = () => read(this);

        update(this);
    }


    get type(): Type {
        return EFFECT;
    }
}

class Root extends Core<null> {
    scheduler: Scheduler;
    tracking: boolean;


    constructor(scheduler: Scheduler, tracking: boolean) {
        super(CLEAN, null);
        this.scheduler = scheduler;
        this.tracking = tracking;
    }


    get type(): Type {
        return ROOT;
    }
}

class Signal<T> extends Core<T> {
    changed: Changed;


    constructor(data: T, options?: Options) {
        super(CLEAN, data);
        this.changed = options?.changed || changed;
    }


    get type(): Type {
        return SIGNAL;
    }


    get() {
        return read(this);
    }

    set(value: T): T {
        return write(this, value);
    }
}


function changed(a: unknown, b: unknown) {
    return a !== b;
}

function notify<T>(nodes: Core<T>[] | null, state: typeof CHECK | typeof DIRTY) {
    if (nodes === null) {
        return;
    }

    for (let i = 0, n = nodes.length; i < n; i++) {
        let node = nodes[i];

        if (node.state < state) {
            if (node.type === EFFECT && node.state === CLEAN) {
                node.root!.scheduler((node as any as Effect).task);
            }

            node.state = state;
            notify(node.observers, CHECK);
        }
    }
}

function read<T>(node: Core<T>) {
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

    if (node.type === COMPUTED || node.type === EFFECT) {
        sync(node);
    }

    return node.value;
}

function removeSourceObservers<T>(node: Core<T>, start: number) {
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

function sync<T>(node: Core<T>) {
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
        update(node as Computed<T> | Effect);
    }
    else {
        node.state = CLEAN;
    }
}

function update<T>(node: Computed<T> | Effect) {
    let i = index,
        o = observer,
        os = observers;

    index = 0;
    observer = node;
    observers = null as typeof observers;

    try {
        node.dispatch('update');
        node.updating = true;

        // @ts-ignore
        let value = node.fn.call(node);

        node.updating = false;

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
            write(node as Computed<T>, value as T);
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

function write<T>(node: Computed<T> | Signal<T>, value: T) {
    if (node.changed(node.value, value)) {
        node.value = value;
        notify(node.observers, DIRTY);
    }

    return value;
}


const computed = <T>(fn: Computed<T>['fn'], options?: Options) => {
    return new Computed(fn, options);
};

const dispose = <T extends { dispose: VoidFunction }>(dispose?: T[] | T | null) => {
    if (dispose == null) {
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

const effect = (fn: Effect['fn']) => {
    return new Effect(fn);
};

const root = <T>(fn: NeverAsync<(root: Root) => T>, scheduler?: Scheduler) => {
    let o = observer,
        s = scope;

    if (scheduler === undefined) {
        if (scope === null) {
            throw new Error('Reactivity: `root` cannot be created without a task scheduler');
        }

        scheduler = scope.scheduler;
    }

    observer = null;
    scope = new Root(scheduler, fn.length > 0);

    let result = fn(scope);

    observer = o;
    scope = s;

    return result;
};

const signal = <T>(value: T, options?: Options) => {
    return new Signal(value, options);
};


export { computed, dispose, effect, root, signal };
export { Computed, Effect, Root, Signal };
import { isArray } from '@esportsplus/utilities';
import { CHECK, CLEAN, COMPUTED, DIRTY, DISPOSED, EFFECT, ROOT, SIGNAL } from './constants';
import { Computed, Changed, Effect, Event, Function, Listener, NeverAsync, Options, Root, Scheduler, Signal, State, Type } from './types';


let index = 0,
    observer: Reactive<any> | null = null,
    observers: Reactive<any>[] | null = null,
    scope: Root | null = null;


class Reactive<T> {
    changed: Changed | null = null;
    fn: Computed<T>['fn'] | Effect['fn'] | null = null;
    listeners: Record<Event, (Listener<any> | null)[]> | null = null;
    observers: Reactive<any>[] | null = null;
    root: Root | null;
    scheduler: Scheduler | null = null;
    sources: Reactive<any>[] | null = null;
    state: State;
    task: Function | null = null;
    tracking: boolean | null = null;
    type: Type;
    value: T;


    constructor(state: State, type: Type, value: T) {
        let root = null;

        if (type !== ROOT) {
            if (scope !== null) {
                root = scope;
            }
            else if (observer !== null) {
                root = observer.root;
            }

            if (root == null) {
                if (type === EFFECT) {
                    throw new Error(`Reactivity: 'effect' cannot be created without a reactive root`);
                }
            }
            else if (root.tracking) {
                root.on('dispose', () => this.dispose());
            }
        }

        this.root = root;
        this.state = state;
        this.type = type;
        this.value = value;
    }


    dispatch<D>(event: Event, data?: D) {
        if (this.listeners === null || this.listeners[event] === undefined) {
            return;
        }

        let listeners = this.listeners[event],
            values = {
                data,
                value: this.value
            };

        for (let i = 0, n = listeners.length; i < n; i++) {
            let listener = listeners[i];

            if (listener === null) {
                continue;
            }

            try {
                listener(values);

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

        this.dispatch('cleanup', this);
        this.dispatch('dispose', this);

        removeSourceObservers(this, 0);

        this.listeners = null;
        this.observers = null;
        this.sources = null;
        this.state = DISPOSED;
    }

    get() {
        if (this.state === DISPOSED) {
            return this.value;
        }

        if (observer !== null) {
            if (observers === null) {
                if (observer.sources !== null && observer.sources[index] == this) {
                    index++;
                }
                else {
                    observers = [this];
                }
            }
            else {
                observers.push(this);
            }
        }

        if (this.type === COMPUTED || this.type === EFFECT) {
            sync(this);
        }

        return this.value;
    }

    on<T>(event: Event, listener: Listener<T>) {
        if (this.state === DIRTY) {
            if (event !== 'cleanup') {
                throw new Error(`Reactivity: events set within computed or effects must use the 'cleanup' event name`);
            }

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

    set(value: T): T {
        if (this.type !== SIGNAL && observer !== this) {
            throw new Error(`Reactivity: 'set' method is only available on signals`);
        }

        if (this.changed!(this.value, value)) {
            this.value = value;
            notify(this.observers, DIRTY);
        }

        return this.value;
    }
}


function changed(a: unknown, b: unknown) {
    return a !== b;
}

function notify<T>(nodes: Reactive<T>[] | null, state: typeof CHECK | typeof DIRTY) {
    if (nodes === null) {
        return;
    }

    for (let i = 0, n = nodes.length; i < n; i++) {
        let node = nodes[i];

        if (node.state < state) {
            if (node.type === EFFECT && node.state === CLEAN) {
                (node as Effect).root.scheduler((node as Effect).task);
            }

            node.state = state;
            notify(node.observers, CHECK);
        }
    }
}

function removeSourceObservers<T>(node: Reactive<T>, start: number) {
    if (node.sources === null) {
        return;
    }

    for (let i = start, n = node.sources.length; i < n; i++) {
        let observers = node.sources[i].observers;

        if (observers === null) {
            continue;
        }

        observers[observers.indexOf(node)] = observers[observers.length - 1];
        observers.pop();
    }
}

function sync<T>(node: Reactive<T>) {
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

function update<T>(node: Reactive<T>) {
    let i = index,
        o = observer,
        os = observers;

    index = 0;
    observer = node;
    observers = null as typeof observers;

    try {
        node.dispatch('cleanup');
        node.dispatch('update');

        // @ts-ignore
        let value = node.fn.call(null, node);

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

                if (source.observers === null) {
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
            node.set(value as T);
        }
    }
    finally {
        index = i;
        observer = o;
        observers = os;
    }

    node.state = CLEAN;
}


const computed = <T>(fn: Computed<T>['fn'], options?: Options) => {
    let instance = new Reactive(DIRTY, COMPUTED, undefined as T);

    instance.changed = options?.changed || changed;
    instance.fn = fn;

    return instance as Computed<T>;
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
    let instance = new Reactive(DIRTY, EFFECT, null);

    instance.fn = fn;
    instance.task = () => instance.get();

    update(instance);

    return instance as Effect;
};

const root = <T>(fn: NeverAsync<(instance: Root) => T>, scheduler?: Scheduler) => {
    let o = observer,
        s = scope;

    if (scheduler === undefined) {
        if (o?.type === EFFECT) {
            scope = o.root;
        }

        if (scope === null) {
            throw new Error('Reactivity: `root` cannot be created without a task scheduler');
        }

        scheduler = scope.scheduler;
    }

    observer = null;

    scope = new Reactive(CLEAN, ROOT, null) as any as Root;
    scope.scheduler = scheduler;
    scope.tracking = fn.length > 0;

    let result = fn.call(null, scope);

    observer = o;
    scope = s;

    return result;
};

const signal = <T>(value: T, options?: Options) => {
    let instance = new Reactive(CLEAN, SIGNAL, value);

    instance.changed = options?.changed || changed;

    return instance as Signal<T>;
};


export { computed, dispose, effect, root, signal };
export { Reactive };
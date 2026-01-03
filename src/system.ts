import {
    COMPUTED,
    SIGNAL,
    STABILIZER_IDLE,
    STABILIZER_RESCHEDULE,
    STABILIZER_RUNNING,
    STABILIZER_SCHEDULED,
    STATE_CHECK,
    STATE_DIRTY,
    STATE_IN_HEAP,
    STATE_NONE,
    STATE_NOTIFY_MASK,
    STATE_RECOMPUTING
} from './constants';
import { Computed, Link, Signal } from './types';
import { isObject } from '@esportsplus/utilities';


let depth = 0,
    heap: (Computed<unknown> | undefined)[] = new Array(64),
    heap_i = 0,
    heap_n = 0,
    linkPool: Link[] = [],
    linkPoolMax = 1000,
    microtask = queueMicrotask,
    notified = false,
    observer: Computed<unknown> | null = null,
    scope: Computed<unknown> | null = null,
    stabilizer = STABILIZER_IDLE,
    version = 0;


function cleanup<T>(computed: Computed<T>): void {
    if (!computed.cleanup) {
        return;
    }

    let value = computed.cleanup;

    if (typeof value === 'function') {
        value();
    }
    else {
        for (let i = 0, n = value.length; i < n; i++) {
            value[i]();
        }
    }

    computed.cleanup = null;
}

function deleteFromHeap<T>(computed: Computed<T>) {
    let state = computed.state;

    if (!(state & STATE_IN_HEAP)) {
        return;
    }

    computed.state = state & ~STATE_IN_HEAP;

    let height = computed.height;

    if (computed.prevHeap === computed) {
        heap[height] = undefined;
    }
    else {
        let next = computed.nextHeap,
            dhh = heap[height]!,
            end = next ?? dhh;

        if (computed === dhh) {
            heap[height] = next;
        }
        else {
            computed.prevHeap.nextHeap = next;
        }

        end.prevHeap = computed.prevHeap;
    }

    computed.nextHeap = undefined;
    computed.prevHeap = computed;
}

function insertIntoHeap<T>(computed: Computed<T>) {
    let state = computed.state;

    if (state & STATE_IN_HEAP) {
        return;
    }

    computed.state = state | STATE_IN_HEAP;

    let height = computed.height,
        heapAtHeight = heap[height];

    if (heapAtHeight === undefined) {
        heap[height] = computed;
    }
    else {
        let tail = heapAtHeight.prevHeap;

        tail.nextHeap = computed;
        computed.prevHeap = tail;
        heapAtHeight.prevHeap = computed;
    }

    if (height > heap_n) {
        heap_n = height;

        // Simple auto adjust to avoid manual management within apps.
        if (height >= heap.length) {
            heap.length = Math.max(height + 1, Math.ceil(heap.length * 2));
        }
    }
}

// https://github.com/stackblitz/alien-signals/blob/v2.0.3/src/system.ts#L52
function link<T>(dep: Signal<T> | Computed<T>, sub: Computed<T>) {
    let prevDep = sub.depsTail;

    if (prevDep && prevDep.dep === dep) {
        return;
    }

    let nextDep: Link | null = null;

    if (sub.state & STATE_RECOMPUTING) {
        nextDep = prevDep ? prevDep.nextDep : sub.deps;

        if (nextDep && nextDep.dep === dep) {
            nextDep.version = version;
            sub.depsTail = nextDep;
            return;
        }
    }

    let prevSub = dep.subsTail;

    // https://github.com/stackblitz/alien-signals/commit/54fe1b3947fac5c0aecb73b0b0eaff000806c454
    if (
        prevSub &&
        prevSub.version === version &&
        prevSub.sub === sub
    ) {
        return;
    }

    let pooled = linkPool.pop(),
        newLink =
            sub.depsTail =
                dep.subsTail = pooled
                    ? (pooled.dep = dep,
                       pooled.sub = sub,
                       pooled.nextDep = nextDep,
                       pooled.prevSub = prevSub,
                       pooled.nextSub = null,
                       pooled.version = version,
                       pooled)
                    : {
                        dep,
                        sub,
                        nextDep,
                        prevSub,
                        nextSub: null,
                        version
                    };

    if (prevDep) {
        prevDep.nextDep = newLink;
    }
    else {
        sub.deps = newLink;
    }

    if (prevSub) {
        prevSub.nextSub = newLink;
    }
    else {
        dep.subs = newLink;
    }
}

function notify<T>(computed: Computed<T>, newState = STATE_DIRTY) {
    let state = computed.state;

    if ((state & STATE_NOTIFY_MASK) >= newState) {
        return;
    }

    computed.state = state | newState;

    for (let link = computed.subs; link; link = link.nextSub) {
        notify(link.sub, STATE_CHECK);
    }
}

function recompute<T>(computed: Computed<T>, del: boolean) {
    if (del) {
        deleteFromHeap(computed);
    }
    else {
        computed.nextHeap = undefined;
        computed.prevHeap = computed;
    }

    if (computed.cleanup) {
        cleanup(computed);
    }

    let o = observer,
        ok = true,
        value;

    observer = computed;
    computed.depsTail = null;
    computed.state = STATE_RECOMPUTING;

    depth++;
    version++;

    try {
        value = computed.fn(onCleanup);
    }
    catch (e) {
        ok = false;
    }

    depth--;
    observer = o;
    computed.state = STATE_NONE;

    let depsTail = computed.depsTail as Link | null,
        remove = depsTail ? depsTail.nextDep : computed.deps;

    if (remove) {
        do {
            remove = unlink(remove);
        }
        while (remove);

        if (depsTail) {
            depsTail.nextDep = null;
        }
        else {
            computed.deps = null;
        }
    }

    if (ok && value !== computed.value) {
        computed.value = value as T;

        for (let c = computed.subs; c; c = c.nextSub) {
            let s = c.sub,
                state = s.state;

            if (state & STATE_CHECK) {
                s.state = state | STATE_DIRTY;
            }

            insertIntoHeap(s);
        }

        schedule();
    }
}

function schedule() {
    if (stabilizer === STABILIZER_SCHEDULED) {
        return;
    }

    if (stabilizer === STABILIZER_IDLE && !depth) {
        stabilizer = STABILIZER_SCHEDULED;
        microtask(stabilize);
    }
    else if (stabilizer === STABILIZER_RUNNING) {
        stabilizer = STABILIZER_RESCHEDULE;
    }
}

function stabilize() {
    let o = observer;

    observer = null;
    stabilizer = STABILIZER_RUNNING;

    for (heap_i = 0; heap_i <= heap_n; heap_i++) {
        let computed = heap[heap_i];

        heap[heap_i] = undefined;

        while (computed !== undefined) {
            let next = computed.nextHeap;

            recompute(computed, false);

            computed = next;
        }
    }

    while (heap_n > 0 && heap[heap_n] === undefined) {
        heap_n--;
    }

    observer = o;

    if (stabilizer === STABILIZER_RESCHEDULE) {
        microtask(stabilize);
    }
    else {
        stabilizer = STABILIZER_IDLE;
    }
}

// https://github.com/stackblitz/alien-signals/blob/v2.0.3/src/system.ts#L100
function unlink(link: Link): Link | null {
    let dep = link.dep,
        nextDep = link.nextDep,
        nextSub = link.nextSub,
        prevSub = link.prevSub;

    if (nextSub) {
        nextSub.prevSub = prevSub;
    }
    else {
        dep.subsTail = prevSub;
    }

    if (prevSub) {
        prevSub.nextSub = nextSub;
    }
    else if ((dep.subs = nextSub) === null && dep.type === COMPUTED) {
        dispose(dep);
    }

    // Release link back to pool
    if (linkPool.length < linkPoolMax) {
        link.dep = link.sub = null as any;
        link.nextDep = link.nextSub = link.prevSub = null;
        linkPool.push(link);
    }

    return nextDep;
}

function update<T>(computed: Computed<T>): void {
    if (computed.state & STATE_CHECK) {
        for (let link = computed.deps; link; link = link.nextDep) {
            let dep = link.dep;

            if (dep.type === COMPUTED) {
                update(dep);

                if (computed.state & STATE_DIRTY) {
                    break;
                }
            }
        }
    }

    if (computed.state & STATE_DIRTY) {
        recompute(computed, true);
    }

    computed.state = STATE_NONE;
}


const computed = <T>(fn: Computed<T>['fn']): Computed<T> => {
    let self: Computed<T> = {
            cleanup: null,
            deps: null,
            depsTail: null,
            fn: fn,
            height: 0,
            nextHeap: undefined,
            prevHeap: null as any,
            state: STATE_NONE,
            subs: null,
            subsTail: null,
            type: COMPUTED,
            value: undefined as T,
        };

    self.prevHeap = self;

    if (observer) {
        if (observer.depsTail === null) {
            self.height = observer.height;
            recompute(self, false);
        }
        else {
            self.height = observer.height + 1;
            insertIntoHeap(self);
            schedule();
        }

        link(self, observer);
        onCleanup(() => dispose(self));
    }
    else {
        recompute(self, false);
        root.disposables++;

        if (scope) {
            onCleanup(() => dispose(self));
        }
    }

    return self;
};

const dispose = <T>(computed: Computed<T>) => {
    deleteFromHeap(computed);

    let dep = computed.deps;

    while (dep) {
        dep = unlink(dep);
    }

    computed.deps = null;

    if (computed.cleanup) {
        cleanup(computed);
    }
};

const effect = <T>(fn: Computed<T>['fn']) => {
    let c = computed(fn);

    return () => {
        dispose(c);
    };
};

const isComputed = (value: unknown): value is Computed<unknown> => {
    return isObject(value) && value.type === COMPUTED;
};

const isSignal = (value: unknown): value is Signal<unknown> => {
    return isObject(value) && value.type === SIGNAL;
};

const onCleanup = (fn: VoidFunction): typeof fn => {
    let parent = observer || scope;

    if (!parent) {
        return fn;
    }

    let cleanup = parent.cleanup;

    if (!cleanup) {
        parent.cleanup = fn;
    }
    else if (typeof cleanup === 'function') {
        parent.cleanup = [cleanup, fn];
    }
    else {
        cleanup.push(fn);
    }

    return fn;
};

const read = <T>(node: Signal<T> | Computed<T>): T => {
    if (observer) {
        link(node, observer);

        if (node.type === COMPUTED) {
            let height = node.height;

            if (height >= observer.height) {
                observer.height = height + 1;
            }

            if (height >= heap_i || node.state & STATE_NOTIFY_MASK) {
                if (!notified) {
                    notified = true;

                    for (let i = 0; i <= heap_n; i++) {
                        for (let computed = heap[i]; computed !== undefined; computed = computed.nextHeap) {
                            notify(computed);
                        }
                    }
                }

                update(node);
            }
        }
    }

    return node.value;
};

const root = <T>(fn: ((dispose: VoidFunction) => T) | (() => T)) => {
    let c,
        d = root.disposables,
        o = observer,
        s = scope,
        self: Computed<unknown> | null = null,
        tracking = fn.length,
        value: T;

    observer = null;
    root.disposables = 0;

    if (tracking) {
        scope = self = { cleanup: null } as Computed<unknown>;
        value = (fn as (dispose: VoidFunction) => T)(c = () => dispose(self!));
    }
    else {
        scope = null;
        value = (fn as () => T)();
    }

    observer = o;
    root.disposables = d;
    scope = s;

    if (c) {
        onCleanup(c);
    }

    return value;
};

root.disposables = 0;

const set = <T>(signal: Signal<T>, value: T) => {
    if (signal.value === value) {
        return;
    }

    notified = false;
    signal.value = value;

    if (signal.subs === null) {
        return;
    }

    for (let link: Link | null = signal.subs; link; link = link.nextSub) {
        insertIntoHeap(link.sub);
    }

    schedule();
};

const signal = <T>(value: T): Signal<T> => {
    return {
        subs: null,
        subsTail: null,
        type: SIGNAL,
        value,
    };
};


export {
    computed,
    dispose,
    effect,
    isComputed, isSignal,
    onCleanup,
    read, root,
    set, signal
};
export type { Computed, Signal };

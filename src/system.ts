import {
    PACKAGE_NAME,
    SIGNAL,
    STABILIZER_IDLE, STABILIZER_RESCHEDULE, STABILIZER_RUNNING, STABILIZER_SCHEDULED,
    STATE_CHECK, STATE_COMPUTED, STATE_DIRTY, STATE_EFFECT, STATE_ERROR, STATE_IN_HEAP, STATE_NOTIFY_MASK, STATE_RECOMPUTING
} from './constants';
import { Computed, Link, SelectorSignal, Signal } from './types';
import { isObject } from '@esportsplus/utilities';


let asyncMeta = new WeakMap<Computed<unknown>, { factory: Computed<unknown>; pending: Signal<boolean> }>(),
    depth = 0,
    heap: (Computed<unknown> | undefined)[] = new Array(64),
    heap_i = 0,
    heap_n = 0,
    linkPoolHead: Link | null = null,
    microtask = queueMicrotask,
    notified = false,
    observer: Computed<unknown> | null = null,
    pendingHead: Signal<unknown> | null = null,
    scope: Computed<unknown> | null = null,
    stabilizer = STABILIZER_IDLE,
    version = 0,
    writes = 0;


function cleanup<T>(computed: Computed<T>): void {
    if (!computed.cleanup) {
        return;
    }

    let errors: unknown[] = [],
        value = computed.cleanup;

    computed.cleanup = null;

    if (typeof value === 'function') {
        try {
            value();
        }
        catch (e) {
            errors.push(e);
        }
    }
    else {
        for (let i = 0, n = value.length; i < n; i++) {
            try {
                value[i]();
            }
            catch (e) {
                errors.push(e);
            }
        }
    }

    if (errors.length) {
        throw errors.length === 1 ? errors[0] : new AggregateError(errors, `${PACKAGE_NAME}: cleanup produced multiple errors`);
    }
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

// Reconstructs main's eager write() fan-out in one batched pass: N writes to one signal
// queue it once, so each subscriber is heap-inserted once. Self-linked nextPending marks the tail.
function drainPending() {
    let node = pendingHead;

    pendingHead = null;

    while (node !== null) {
        let next = node.nextPending === node ? null : node.nextPending;

        node.nextPending = null;

        for (let link: Link | null = node.subs; link; link = link.nextSub) {
            insertIntoHeap(link.sub);
        }

        node = next;
    }
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
    // rv === version proves this dep already linked to the current observer during this run
    if (dep.rv === version) {
        return;
    }

    let prevDep = sub.depsTail;

    if (prevDep && prevDep.dep === dep) {
        dep.rv = version;
        return;
    }

    let nextDep: Link | null = null;

    if (sub.state & STATE_RECOMPUTING) {
        nextDep = prevDep ? prevDep.nextDep : sub.deps;

        if (nextDep && nextDep.dep === dep) {
            dep.rv = version;
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
        dep.rv = version;
        return;
    }

    dep.rv = version;

    let pooled = linkPoolHead,
        newLink =
            sub.depsTail =
                dep.subsTail = pooled
                    ? (linkPoolHead = pooled.nextDep,
                       pooled.dep = dep,
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

function notify<T>(computed: Computed<T>, newState: number) {
    let state = computed.state;

    if ((state & STATE_NOTIFY_MASK) >= newState) {
        return;
    }

    computed.state = state | newState;

    for (let link = computed.subs; link; link = link.nextSub) {
        notify(link.sub, STATE_CHECK);
    }
}

// Shared by read()'s tracked pull and peek()'s untracked pull. observer is nulled around update()
// so a recompute triggered here tracks into the node's own scope, never the caller's.
function pull<T>(node: Computed<T>): void {
    if (!notified) {
        notified = true;

        for (let i = 0; i <= heap_n; i++) {
            for (let computed = heap[i]; computed !== undefined; computed = computed.nextHeap) {
                notify(computed, STATE_DIRTY);
            }
        }
    }

    let o = observer;

    observer = null;
    update(node);
    observer = o;
}

function propagate<T>(computed: Computed<T>) {
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

function recompute<T>(computed: Computed<T>, del: boolean) {
    if (del) {
        deleteFromHeap(computed);
    }
    else {
        computed.nextHeap = undefined;
        computed.prevHeap = computed;
    }

    if (computed.cleanup) {
        // A failing PREVIOUS generation's teardown must not poison this recompute or the stabilize pass
        try {
            cleanup(computed);
        }
        catch (e) {
            microtask(() => {
                throw e;
            });
        }
    }

    let err: unknown,
        flags = computed.state & STATE_EFFECT,
        hadError = computed.state & STATE_ERROR,
        o = observer,
        ok = true,
        value,
        w = writes;

    observer = computed;
    computed.depsTail = null;
    computed.state = STATE_COMPUTED | STATE_RECOMPUTING | flags;

    depth++;
    version++;

    try {
        value = computed.fn(onCleanup);
    }
    catch (e) {
        ok = false;
        err = e;
    }

    depth--;
    // Fresh version so rv/link stamps from this run (incl. nested creations) go stale — false negatives only
    version++;
    observer = o;
    computed.state = STATE_COMPUTED | flags;
    // Entry snapshot, not current writes: a node whose fn wrote mid-run must stay gv < writes and validate normally
    computed.gv = w;

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

    if (ok) {
        computed.error = null;

        if (value !== computed.value || hadError) {
            computed.value = value as T;
            propagate(computed);
        }
    }
    else {
        computed.error = err;
        computed.state |= STATE_ERROR;

        if (flags) {
            microtask(() => {
                throw err;
            });
        }
        else {
            propagate(computed);
        }
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
        // Drain before scanning each height so writes emitted by a lower level's recompute
        // land their subscribers in this same pass, matching main's eager same-pass pickup
        if (pendingHead !== null) {
            drainPending();
        }

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
        stabilizer = STABILIZER_SCHEDULED;
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
    else if ((dep.subs = nextSub) === null) {
        if ((dep as Computed<unknown>).state & STATE_COMPUTED) {
            dispose(dep as Computed<unknown>);
        }
        else if ((dep as SelectorSignal<unknown>).parent !== undefined) {
            let parent = (dep as SelectorSignal<unknown>).parent;

            parent.keys!.delete((dep as SelectorSignal<unknown>).key);

            if (parent.keys!.size === 0) {
                parent.keys = null;
            }
        }
    }

    link.dep = link.sub = null as any;
    link.nextSub = link.prevSub = null;
    link.nextDep = linkPoolHead;
    linkPoolHead = link;

    return nextDep;
}

function update<T>(computed: Computed<T>): void {
    let w = writes;

    // gv === writes proves no write landed anywhere since this node last validated — O(1) clean-graph exit
    if (computed.gv === w) {
        computed.state &= ~STATE_NOTIFY_MASK;
        return;
    }

    if (computed.state & STATE_CHECK) {
        for (let link = computed.deps; link; link = link.nextDep) {
            let dep = link.dep;

            if ((dep as Computed<unknown>).state & STATE_COMPUTED) {
                update(dep as Computed<unknown>);

                if (computed.state & STATE_DIRTY) {
                    break;
                }
            }
        }
    }

    if (computed.state & STATE_DIRTY) {
        recompute(computed, true);
    }
    else {
        computed.gv = w;
    }

    computed.state &= ~STATE_NOTIFY_MASK;
}


const asyncComputed = <T>(fn: Computed<Promise<T>>['fn']): Computed<T | undefined> => {
    let error = signal<unknown>(undefined),
        factory = computed(fn),
        node = signal<T | undefined>(undefined),
        pending = signal(false),
        v = 0;

    let stop = effect(() => {
        let id = ++v;

        write(pending, true);

        // Heap membership (a write's eager insert) marks a pending re-run the notify mask alone misses.
        (read(factory) as Promise<T>).then(
            (value) => {
                if (id === v && !(factory.state & (STATE_IN_HEAP | STATE_NOTIFY_MASK))) {
                    write(error, undefined);
                    write(node, value);
                    write(pending, false);
                }
            },
            (e) => {
                if (id === v && !(factory.state & (STATE_IN_HEAP | STATE_NOTIFY_MASK))) {
                    write(error, e === undefined ? new Error('reactivity: asyncComputed rejected with undefined') : e);
                    write(pending, false);
                }
            }
        );
    });

    let wrapper = computed(() => {
        let e = read(error);

        if (e !== undefined) {
            throw e;
        }

        return read(node);
    });

    asyncMeta.set(wrapper as Computed<unknown>, { factory: factory as Computed<unknown>, pending });

    wrapper.disposal = stop;

    return wrapper;
};

// Reuses the same recompute-nesting counter schedule() consults, so writes inside fn defer
// scheduling until fn returns; pair with flush() for a synchronous transaction.
const batch = <T>(fn: () => T): T => {
    depth++;

    try {
        return fn();
    }
    finally {
        depth--;

        if (!depth) {
            schedule();
        }
    }
};

const computed = <T>(fn: Computed<T>['fn']): Computed<T> => {
    let self: Computed<T> = {
            cleanup: null,
            deps: null,
            depsTail: null,
            disposal: null,
            error: null,
            fn: fn,
            gv: 0,
            height: 0,
            nextHeap: undefined,
            prevHeap: null as any,
            rv: 0,
            state: STATE_COMPUTED,
            subs: null,
            subsTail: null,
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

    if (computed.disposal) {
        let d = computed.disposal;

        computed.disposal = null;
        d();
    }
};

const effect = <T>(fn: Computed<T>['fn'], onError?: (e: unknown) => void) => {
    let c = computed<T | undefined>(
            onError
                ? (o) => {
                    try {
                        return fn(o);
                    }
                    catch (e) {
                        onError(e);
                    }
                }
                : fn
        );

    c.state |= STATE_EFFECT;

    // The creation run precedes the EFFECT tag, so its failure bypasses recompute's rethrow arm.
    if (c.state & STATE_ERROR) {
        let err = c.error;

        microtask(() => {
            throw err;
        });
    }

    return () => {
        dispose(c);
    };
};

// RUNNING/RESCHEDULE means a pass is already draining (or a flush is already in this call chain);
// re-entering stabilize here would corrupt heap_i, so this is a deliberate no-op.
// Loops (not a single call): a write during a pass can target a height stabilize()'s current
// pass already scanned past, which only flips stabilizer to RESCHEDULE for the *next* microtask
// rather than draining in-pass — looping here is what actually settles that tail synchronously.
const flush = (): void => {
    while (stabilizer === STABILIZER_SCHEDULED) {
        stabilize();
    }
};

const isComputed = (value: unknown): value is Computed<unknown> => {
    return isObject(value) && !!((value as unknown as Computed<unknown>).state & STATE_COMPUTED);
};

const isPending = (node: Computed<unknown>): boolean => {
    let meta = asyncMeta.get(node);

    return meta ? read(meta.pending) : false;
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

        if ((node as Computed<unknown>).state & STATE_COMPUTED) {
            // Invariant 1: a tracked mid-cycle read must see pending writes — drain so the heap
            // and this node's notify bits reflect them before the broadcast condition is read
            if (pendingHead !== null) {
                drainPending();
            }

            let height = (node as Computed<T>).height;

            if (height >= observer.height) {
                observer.height = height + 1;
            }

            if (height >= heap_i || (node as Computed<T>).state & STATE_NOTIFY_MASK) {
                pull(node as Computed<T>);
            }
        }
    }

    if ((node as Computed<T>).state & STATE_ERROR) {
        throw (node as Computed<T>).error;
    }

    return node.value;
};

const peek = <T>(node: Signal<T> | Computed<T>): T => {
    if ((node as Computed<T>).state & STATE_COMPUTED) {
        if (pendingHead !== null) {
            drainPending();
        }

        pull(node as Computed<T>);
    }

    if ((node as Computed<T>).state & STATE_ERROR) {
        throw (node as Computed<T>).error;
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
        scope = self = { cleanup: null, state: STATE_COMPUTED } as Computed<unknown>;
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

const signal = <T>(value: T): Signal<T> => {
    return {
        keys: null,
        nextPending: null,
        rv: 0,
        subs: null,
        subsTail: null,
        type: SIGNAL,
        value,
    };
};

// SameValueZero (Map) key lookup: NaN matches itself, ±0 collapse — slightly wider than === for those.
// Object keys compare by reference and must be stable. The initial snapshot below uses ===.
signal.is = <T>(node: Signal<T>, key: T): boolean => {
    if (!observer) {
        return node.value === key;
    }

    let keys = (node.keys ??= new Map()),
        entry = keys.get(key);

    if (entry === undefined) {
        keys.set(key, entry = {
            key,
            keys: null,
            nextPending: null,
            parent: node,
            rv: 0,
            subs: null,
            subsTail: null,
            type: SIGNAL,
            value: node.value === key
        });
    }

    return read(entry);
};

const untrack = <T>(fn: () => T): T => {
    let o = observer;

    observer = null;

    try {
        return fn();
    }
    finally {
        observer = o;
    }
};

const write = <T>(signal: Signal<T>, value: T) => {
    let prev = signal.value;

    if (prev === value) {
        return;
    }

    signal.value = value;
    writes++;

    // Per-key fan-out: only the leaving (prev) and entering (value) entries flip — O(2), key-count independent.
    // Runs before the subs === null exit: a parent may carry per-key subscribers yet zero direct subs.
    if (signal.keys !== null) {
        let entry = signal.keys.get(prev);

        if (entry !== undefined) {
            write(entry, false);
        }

        entry = signal.keys.get(value);

        if (entry !== undefined) {
            write(entry, true);
        }
    }

    if (signal.subs === null) {
        return;
    }

    notified = false;

    // O(1) deferred mark: queue the signal (self-link = tail) unless already queued; fan-out defers to drain
    if (signal.nextPending === null) {
        signal.nextPending = pendingHead ?? signal;
        pendingHead = signal;
    }

    schedule();
};


export {
    asyncComputed,
    batch,
    computed,
    dispose,
    effect,
    flush,
    isComputed, isPending, isSignal,
    onCleanup,
    peek,
    read, root,
    signal,
    untrack,
    write
};
export type { Computed, Signal };

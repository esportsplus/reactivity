import { isArray, isObject } from '@esportsplus/utilities';
import { REACTIVE, STATE_CHECK, STATE_DIRTY, STATE_IN_HEAP, STATE_NONE, STATE_RECOMPUTING } from './constants';
import { Computed, Link, Signal, } from './types';


let depth = 0,
    heap: (Computed<unknown> | undefined)[] = new Array(2000),
    index = 0,
    length = 0,
    notified = false,
    observer: Computed<unknown> | null = null,
    scheduled = false,
    version = 0;


function cleanup<T>(node: Computed<T>): void {
    if (!node.cleanup) {
        return;
    }

    let cleanup = node.cleanup;

    if (isArray(cleanup)) {
        for (let i = 0; i < cleanup.length; i++) {
            cleanup[i]();
        }
    }
    else {
        cleanup();
    }

    node.cleanup = null;
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

    if (height > length) {
        length = height;

        // Simple auto adjust to avoid manual management within apps.
        if (height >= heap.length) {
            heap.length += 250;
        }
    }
}

// https://github.com/stackblitz/alien-signals/blob/v2.0.3/src/system.ts#L52
function link<T>(dep: Signal<T> | Computed<T>, sub: Computed<T>) {
    let prevDep = sub.depsTail;

    if (prevDep !== null && prevDep.dep === dep) {
        return;
    }

    let nextDep: Link | null = null;

    if (sub.state & STATE_RECOMPUTING) {
        nextDep = prevDep !== null ? prevDep.nextDep : sub.deps;

        if (nextDep !== null && nextDep.dep === dep) {
            nextDep.version = version;
            sub.depsTail = nextDep;
            return;
        }
    }

    let prevSub = dep.subsTail;

    // https://github.com/stackblitz/alien-signals/commit/54fe1b3947fac5c0aecb73b0b0eaff000806c454
    if (
        prevSub !== null &&
        prevSub.version === version &&
        prevSub.sub === sub
    ) {
        return;
    }

    let newLink =
            sub.depsTail =
                dep.subsTail = {
                    dep,
                    sub,
                    nextDep,
                    prevSub,
                    nextSub: null,
                    version
                };

    if (prevDep !== null) {
        prevDep.nextDep = newLink;
    }
    else {
        sub.deps = newLink;
    }

    if (prevSub !== null) {
        prevSub.nextSub = newLink;
    }
    else {
        dep.subs = newLink;
    }
}

function notify<T>(computed: Computed<T>, newState = STATE_DIRTY) {
    let state = computed.state;

    if ((state & (STATE_CHECK | STATE_DIRTY)) >= newState) {
        return;
    }

    computed.state = state | newState;

    for (let link = computed.subs; link !== null; link = link.nextSub) {
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

    cleanup(computed);

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

    observer = o;
    computed.state = STATE_NONE;

    let depsTail = computed.depsTail as Link | null,
        toRemove = depsTail !== null ? depsTail.nextDep : computed.deps;

    if (toRemove !== null) {
        do {
            toRemove = unlink(toRemove);
        }
        while (toRemove !== null);

        if (depsTail !== null) {
            depsTail.nextDep = null;
        }
        else {
            computed.deps = null;
        }
    }

    if (ok && value !== computed.value) {
        computed.value = value as T;

        for (let c = computed.subs; c !== null; c = c.nextSub) {
            let o = c.sub,
                state = o.state;

            if (state & STATE_CHECK) {
                o.state = state | STATE_DIRTY;
            }

            insertIntoHeap(o);
        }
    }

    if (!--depth && !scheduled) {
        scheduled = true;
        queueMicrotask(stabilize);
    }
}

function stabilize() {
    root(() => {
        for (index = 0; index <= length; index++) {
            let computed = heap[index];

            heap[index] = undefined;

            while (computed !== undefined) {
                let next = computed.nextHeap;

                recompute(computed, false);

                computed = next;
            }
        }

        scheduled = false;
    });
}

// https://github.com/stackblitz/alien-signals/blob/v2.0.3/src/system.ts#L100
function unlink(link: Link): Link | null {
    let { dep, nextDep, nextSub, prevSub } = link;

    if (nextSub !== null) {
        nextSub.prevSub = prevSub;
    }
    else {
        dep.subsTail = prevSub;
    }

    if (prevSub !== null) {
        prevSub.nextSub = nextSub;
    }
     else {
        dep.subs = nextSub;

        if (nextSub === null && 'fn' in dep) {
            dispose(dep);
        }
    }

    return nextDep;
}

function update<T>(computed: Computed<T>): void {
    if (computed.state & STATE_CHECK) {
        for (let link = computed.deps; link; link = link.nextDep) {
            let dep = link.dep;

            if ('fn' in dep) {
                update(dep);
            }

            if (computed.state & STATE_DIRTY) {
                break;
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
            [REACTIVE]: true,
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
        }

        link(self, observer);
    }
    else {
        recompute(self, false);
    }

    return self;
};

const dispose = <T>(computed: Computed<T>) => {
    deleteFromHeap(computed);

    let dep = computed.deps;

    while (dep !== null) {
        dep = unlink(dep);
    }

    computed.deps = null;

    cleanup(computed);
};

const effect = <T>(fn: Computed<T>['fn']) => {
    let c = computed(fn);

    return () => {
        dispose(c);
    };
};

const isComputed = (value: unknown): value is Computed<unknown> => {
    return isObject(value) && REACTIVE in value && 'fn' in value;
};

const isSignal = (value: unknown): value is Signal<unknown> => {
    return isObject(value) && REACTIVE in value && 'fn' in value === false;
};

const onCleanup = (fn: VoidFunction): typeof fn => {
    if (!observer) {
        return fn;
    }

    let node = observer;

    if (!node.cleanup) {
        node.cleanup = fn;
    }
    else if (isArray(node.cleanup)) {
        node.cleanup.push(fn);
    }
    else {
        node.cleanup = [node.cleanup, fn];
    }

    return fn;
};

const read = <T>(node: Signal<T> | Computed<T>): T => {
    if (observer) {
        link(node, observer);

        if ('fn' in node) {
            let height = node.height;

            if (height >= observer.height) {
                observer.height = height + 1;
            }

            if (
                height >= index ||
                node.state & (STATE_DIRTY | STATE_CHECK)
            ) {
                if (!notified) {
                    notified = true;

                    for (let i = 0; i <= length; i++) {
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

const root = <T>(fn: () => T) => {
    let o = observer;

    observer = null;

    let value = fn();

    observer = o;

    return value;
};

const signal = <T>(value: T): Signal<T> => {
    return {
        [REACTIVE]: true,
        subs: null,
        subsTail: null,
        value,
    };
};

signal.set = <T>(signal: Signal<T>, value: T) => {
    if (signal.value === value) {
        return;
    }

    notified = false;
    signal.value = value;

    for (let link = signal.subs; link !== null; link = link.nextSub) {
        insertIntoHeap(link.sub);
    }
};


export {
    computed,
    dispose,
    effect,
    isComputed, isSignal,
    onCleanup,
    read, root,
    signal
};
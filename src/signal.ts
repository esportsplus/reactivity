import { isArray, isObject } from '@esportsplus/utilities';
import { REACTIVE, STATE_CHECK, STATE_DIRTY, STATE_IN_HEAP, STATE_NONE, STATE_RECOMPUTING } from './constants';
import { Computed, Link, Signal, } from './types';


let dirtyHeap: (Computed<unknown> | undefined)[] = new Array(2000),
    maxDirty = 0,
    markedHeap = false,
    minDirty = 0,
    observer: Computed<unknown> | null = null;


function cleanup<T>(node: Computed<T>): void {
    if (!node.cleanup) {
        return;
    }

    if (isArray(node.cleanup)) {
        for (let i = 0; i < node.cleanup.length; i++) {
            node.cleanup[i]();
        }
    }
    else {
        node.cleanup();
    }

    node.cleanup = null;
}

function deleteFromHeap<T>(n: Computed<T>) {
    let state = n.state;

    if (!(state & STATE_IN_HEAP)) {
        return;
    }

    n.state = state & ~STATE_IN_HEAP;

    let height = n.height;

    if (n.prevHeap === n) {
        dirtyHeap[height] = undefined;
    }
    else {
        let next = n.nextHeap,
            dhh = dirtyHeap[height]!,
            end = next ?? dhh;

        if (n === dhh) {
            dirtyHeap[height] = next;
        }
        else {
            n.prevHeap.nextHeap = next;
        }

        end.prevHeap = n.prevHeap;
    }

    n.nextHeap = undefined;
    n.prevHeap = n;
}

function insertIntoHeap<T>(n: Computed<T>) {
    let state = n.state;

    if (state & STATE_IN_HEAP) {
        return;
    }

    n.state = state | STATE_IN_HEAP;

    let height = n.height,
        heapAtHeight = dirtyHeap[height];

    if (heapAtHeight === undefined) {
        dirtyHeap[height] = n;
    }
    else {
        let tail = heapAtHeight.prevHeap;

        tail.nextHeap = n;
        n.prevHeap = tail;
        heapAtHeight.prevHeap = n;
    }

    if (height > maxDirty) {
        maxDirty = height;

        // Simple auto adjust to avoid manual management within apps.
        if (height >= dirtyHeap.length) {
            dirtyHeap.length += 250;
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
            sub.depsTail = nextDep;
            return;
        }
    }

    let prevSub = dep.subsTail,
        newLink =
            sub.depsTail =
                dep.subsTail = {
                    dep,
                    sub,
                    nextDep,
                    prevSub,
                    nextSub: null,
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

function markHeap() {
    if (markedHeap) {
        return;
    }

    markedHeap = true;

    for (let i = 0; i <= maxDirty; i++) {
        for (let el = dirtyHeap[i]; el !== undefined; el = el.nextHeap) {
            markNode(el);
        }
    }
}

function markNode<T>(el: Computed<T>, newState = STATE_DIRTY) {
    let state = el.state;

    if ((state & (STATE_CHECK | STATE_DIRTY)) >= newState) {
        return;
    }

    el.state = state | newState;

    for (let link = el.subs; link !== null; link = link.nextSub) {
        markNode(link.sub, STATE_CHECK);
    }
}

function recompute<T>(el: Computed<T>, del: boolean) {
    if (del) {
        deleteFromHeap(el);
    }
    else {
        el.nextHeap = undefined;
        el.prevHeap = el;
    }

    cleanup(el);

    let o = observer,
        ok = true,
        value;

    observer = el;
    el.depsTail = null;
    el.state = STATE_RECOMPUTING;

    try {
        value = el.fn(oncleanup);
    }
    catch (e) {
        ok = false;
    }

    observer = o;
    el.state = STATE_NONE;

    let depsTail = el.depsTail as Link | null,
        toRemove = depsTail !== null ? depsTail.nextDep : el.deps;

    if (toRemove !== null) {
        do {
            toRemove = unlink(toRemove);
        }
        while (toRemove !== null);

        if (depsTail !== null) {
            depsTail.nextDep = null;
        }
        else {
            el.deps = null;
        }
    }

    if (ok && value !== el.value) {
        el.value = value as T;

        for (let s = el.subs; s !== null; s = s.nextSub) {
            let o = s.sub,
                state = o.state;

            if (state & STATE_CHECK) {
                o.state = state | STATE_DIRTY;
            }

            insertIntoHeap(o);
        }
    }
}

// https://github.com/stackblitz/alien-signals/blob/v2.0.3/src/system.ts#L100
function unlink(link: Link): Link | null {
    let dep = link.dep,
        nextDep = link.nextDep,
        nextSub = link.nextSub,
        prevSub = link.prevSub;

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

function update<T>(el: Computed<T>): void {
    if (el.state & STATE_CHECK) {
        for (let d = el.deps; d; d = d.nextDep) {
            let dep = d.dep;

            if ('fn' in dep) {
                update(dep);
            }

            if (el.state & STATE_DIRTY) {
                break;
            }
        }
    }

    if (el.state & STATE_DIRTY) {
        recompute(el, true);
    }

    el.state = STATE_NONE;
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

const dispose = <T>(el: Computed<T>) => {
    deleteFromHeap(el);

    let dep = el.deps;

    while (dep !== null) {
        dep = unlink(dep);
    }

    el.deps = null;

    cleanup(el);
}

const isComputed = (value: unknown): value is Computed<unknown> => {
    return isObject(value) && REACTIVE in value && 'fn' in value;
};

const isReactive = (value: unknown): value is Computed<unknown> | Signal<unknown> => {
    return isObject(value) && REACTIVE in value;
};

const isSignal = (value: unknown): value is Signal<unknown> => {
    return isObject(value) && REACTIVE in value && 'fn' in value === false;
};

const oncleanup = (fn: VoidFunction): typeof fn => {
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

const read = <T>(el: Signal<T> | Computed<T>): T => {
    if (observer) {
        link(el, observer);

        if ('fn' in el) {
            let height = el.height;

            if (height >= observer.height) {
                observer.height = height + 1;
            }

            if (
                height >= minDirty ||
                el.state & (STATE_DIRTY | STATE_CHECK)
            ) {
                markHeap();
                update(el);
            }
        }
    }

    return el.value;
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

signal.set = <T>(el: Signal<T>, v: T) => {
    if (el.value === v) {
        return;
    }

    el.value = v;

    for (let link = el.subs; link !== null; link = link.nextSub) {
        markedHeap = false;
        insertIntoHeap(link.sub);
    }
};

const stabilize = () => {
    for (minDirty = 0; minDirty <= maxDirty; minDirty++) {
        let el = dirtyHeap[minDirty];

        dirtyHeap[minDirty] = undefined;

        while (el !== undefined) {
            let next = el.nextHeap;

            recompute(el, false);

            el = next;
        }
    }
};


export {
    computed,
    dispose,
    isComputed, isReactive, isSignal,
    oncleanup,
    read, root,
    signal, stabilize
};
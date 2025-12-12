import { COMPUTED, SIGNAL, STATE_CHECK, STATE_DIRTY, STATE_IN_HEAP, STATE_NONE, STATE_RECOMPUTING } from './constants';
import { ReactiveArray } from './reactive/array';
import { ReactiveObject } from './reactive/object';


interface Computed<T> {
    cleanup: VoidFunction | VoidFunction[] | null;
    deps: Link | null;
    depsTail: Link | null;
    fn: (this: Computed<unknown>, onCleanup?: (fn: VoidFunction) => typeof fn) => T;
    height: number;
    nextHeap: Computed<unknown> | undefined;
    prevHeap: Computed<unknown>;
    state:
        typeof STATE_CHECK |
        typeof STATE_DIRTY |
        typeof STATE_IN_HEAP |
        typeof STATE_NONE |
        typeof STATE_RECOMPUTING;
    subs: Link | null;
    subsTail: Link | null;
    type: typeof COMPUTED;
    value: T;
}

interface Link {
    dep: Signal<unknown> | Computed<unknown>;
    sub: Computed<unknown>;
    nextDep: Link | null;
    nextSub: Link | null;
    prevSub: Link | null;
    version: number;
}

type Signal<T> = {
    subs: Link | null;
    subsTail: Link | null;
    type: typeof SIGNAL;
    value: T;
};


export type {
    Computed,
    Link,
    Signal,
    ReactiveArray, ReactiveObject
};
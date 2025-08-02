import { REACTIVE, STATE_CHECK, STATE_DIRTY, STATE_IN_HEAP, STATE_NONE, STATE_RECOMPUTING } from './constants';
import { onCleanup } from './system';
import { ReactiveArray } from './reactive/array';
import { ReactiveObject } from './reactive/object';


interface Computed<T> extends Signal<T> {
    [REACTIVE]: true;
    cleanup: VoidFunction | VoidFunction[] | null;
    deps: Link | null;
    depsTail: Link | null;
    fn: (oc?: typeof onCleanup) => T;
    height: number;
    nextHeap: Computed<unknown> | undefined;
    prevHeap: Computed<unknown>;
    state:
        typeof STATE_CHECK |
        typeof STATE_DIRTY |
        typeof STATE_IN_HEAP |
        typeof STATE_NONE |
        typeof STATE_RECOMPUTING;
}

type Infer<T> =
    T extends (...args: unknown[]) => unknown
        ? ReturnType<T>
        : T extends (infer U)[]
            ? ReactiveArray<U>
            : T extends ReactiveObject<any>
                ? T
                : T extends Record<PropertyKey, unknown>
                    ? { [K in keyof T]: T[K] }
                    : T;

interface Link {
    dep: Signal<unknown> | Computed<unknown>;
    sub: Computed<unknown>;
    nextDep: Link | null;
    nextSub: Link | null;
    prevSub: Link | null;
    version: number;
}

type Reactive<T> = T extends Record<PropertyKey, unknown>
    ? ReactiveObject<T>
    : ReactiveArray<T>;

type Signal<T> = {
    [REACTIVE]: true;
    subs: Link | null;
    subsTail: Link | null;
    value: T;
};


export type {
    Computed,
    Infer,
    Link,
    Signal,
    Reactive, ReactiveArray, ReactiveObject
};
import { COMPUTED, SIGNAL, STATE_CHECK, STATE_DIRTY, STATE_IN_HEAP, STATE_NONE, STATE_RECOMPUTING } from './constants';
import { ReactiveArray, ReactiveObject } from './reactive';
import { ts } from '@esportsplus/typescript';


type BindingType = 'array' | 'computed' | 'object' | 'signal';

type Bindings = Map<string, BindingType>;

interface Computed<T> {
    cleanup: VoidFunction | VoidFunction[] | null;
    deps: Link | null;
    depsTail: Link | null;
    fn: (onCleanup?: (fn: VoidFunction) => typeof fn) => T;
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
    nextDep: Link | null;
    nextSub: Link | null;
    prevSub: Link | null;
    sub: Computed<unknown>;
    version: number;
}

type Signal<T> = {
    subs: Link | null;
    subsTail: Link | null;
    type: typeof SIGNAL;
    value: T;
};

interface TransformResult {
    code: string;
    sourceFile: ts.SourceFile;
    transformed: boolean;
}


export type {
    BindingType,
    Bindings,
    Computed,
    Link,
    ReactiveArray,
    ReactiveObject,
    Signal,
    TransformResult
};

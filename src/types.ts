import { ts } from '@esportsplus/typescript';
import { COMPILER_TYPES, COMPUTED, SIGNAL, STATE_CHECK, STATE_DIRTY, STATE_IN_HEAP, STATE_NONE, STATE_RECOMPUTING } from './constants';
import { ReactiveArray } from './reactive';


type Bindings = Map<string, COMPILER_TYPES>;

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

// If we expose internals optimizing compiler may break api.
// Instead we will use this as a shim.
declare const READONLY: unique symbol;

type Reactive<T> = T extends (...args: unknown[]) => Promise<infer R>
    ? (R | undefined) & { readonly [READONLY]: true }
    : T extends (...args: any[]) => infer R
        ? R & { readonly [READONLY]: true }
        : T extends (infer U)[]
            ? U[] & Pick<ReactiveArray<U>, 'clear' | 'on' | 'once'>
            : T extends Record<PropertyKey, unknown>
                ? { [K in keyof T]: T[K] } & { dispose: VoidFunction }
                : T;

type Signal<T> = {
    subs: Link | null;
    subsTail: Link | null;
    type: typeof SIGNAL;
    value: T;
};

interface TransformResult {
    changed: boolean;
    code: string;
    sourceFile: ts.SourceFile;
}


export type {
    Bindings,
    Computed,
    Link,
    Reactive,
    Signal,
    TransformResult
};

import { ts } from '@esportsplus/typescript';
import { SIGNAL } from './constants';
import { ReactiveArray } from './reactive';


interface Computed<T> {
    cleanup: VoidFunction | VoidFunction[] | null;
    deps: Link | null;
    depsTail: Link | null;
    fn: (onCleanup: (fn: VoidFunction) => typeof fn) => T;
    height: number;
    nextHeap: Computed<unknown> | undefined;
    prevHeap: Computed<unknown>;
    state: number;
    subs: Link | null;
    subsTail: Link | null;
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
            ? U[] & Pick<ReactiveArray<U>, 'clear' | 'dispose' | 'on' | 'once'>
            : T extends Record<PropertyKey, unknown>
                ? { [K in keyof T]: T[K] extends (infer U)[] ? Reactive<U[]> : T[K]; } & { dispose: VoidFunction }
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
    Computed,
    Link,
    Reactive,
    Signal,
    TransformResult
};

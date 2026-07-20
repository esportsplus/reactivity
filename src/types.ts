import { ts } from '@esportsplus/typescript';
import { SIGNAL } from './constants';
import { ReactiveArray } from './reactive';


interface Computed<T> {
    cleanup: VoidFunction | VoidFunction[] | null;
    deps: Link | null;
    depsTail: Link | null;
    disposal: VoidFunction | null;
    equals: ((a: unknown, b: unknown) => boolean) | null;
    error: unknown;
    fn: (onCleanup: (fn: VoidFunction) => typeof fn) => T;
    gv: number;
    height: number;
    nextHeap: Computed<unknown> | undefined;
    prevHeap: Computed<unknown>;
    rv: number;
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

type Reactive<T> = T extends (...args: never[]) => infer R
    ? Settled<R> & { readonly [READONLY]: true }
    : T extends (infer U)[]
        ? U[] & Pick<ReactiveArray<U>, 'clear' | 'dispose' | 'on' | 'once'>
        : T extends Record<PropertyKey, unknown>
            ? { [K in keyof T]: T[K] extends (infer U)[] ? Reactive<U[]> : T[K]; } & { dispose: VoidFunction }
            : T;

type SelectorSignal<T> = Signal<boolean> & {
    key: T;
    parent: Signal<T>;
};

// A fn returning a Promise/AsyncIterable yields a settled value; a plain fn yields its value.
type Settled<T> =
    T extends Promise<infer U> ? Awaited<U> | undefined :
    T extends AsyncIterable<infer U> ? U | undefined :
    T;

type Signal<T> = {
    equals: ((a: unknown, b: unknown) => boolean) | null;
    keys: Map<T, SelectorSignal<T>> | null;
    nextPending: Signal<unknown> | null;
    rv: number;
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
    SelectorSignal,
    Settled,
    Signal,
    TransformResult
};

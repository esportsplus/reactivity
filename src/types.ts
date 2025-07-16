import { Function, NeverAsync, Prettify } from '@esportsplus/utilities'
import { ReactiveArray } from './reactive/array';
import { ReactiveObject } from './reactive/object';
import { CHECK, CLEAN, COMPUTED, DIRTY, DISPOSED, EFFECT, ROOT, SIGNAL } from './constants';
import { Reactive } from './signal';


type Base<T> = Omit<Reactive<T>, 'changed' | 'fn' | 'get' | 'scheduler' | 'set' | 'task' | 'tracking'>;

type Changed = (a: unknown, b: unknown) => boolean;

type Computed<T> = {
    changed: Changed;
    fn: NeverAsync<(instance: Computed<T>) => T>;
    get(): T;
} & Base<T>;

type Effect = {
    fn: NeverAsync<(instance: Effect) => void>;
    root: Root;
    task: Function;
} & Omit<Base<void>, 'value'>;

type Infer<T> =
    T extends (...args: unknown[]) => unknown
        ? ReturnType<T>
        : T extends (infer U)[]
            ? ReactiveArray<U>
            : T extends ReactiveObject<T>
                ? ReactiveObject<T>
                : T extends Record<PropertyKey, unknown>
                    ? { [K in keyof T]: T[K] }
                    : T;

type Event = string;

type Listener<D> = {
    once?: boolean;

    <V>(data: D, value: V): void;
};

type Options = {
    changed?: Changed;
};

type Root = {
    scheduler: Scheduler;
    tracking: boolean;
    value: void;
} & Omit<Reactive<void>, 'root'>;

type Scheduler = (fn: Function) => unknown;

type Signal<T> = {
    changed: Changed;
    get(): T;
    set(value: T): T;
} & Base<T>;

type State = typeof CHECK | typeof CLEAN | typeof DIRTY | typeof DISPOSED;

type Type = typeof COMPUTED | typeof EFFECT | typeof ROOT | typeof SIGNAL;


export type {
    Changed, Computed,
    Effect, Event,
    Function,
    Infer,
    Listener,
    NeverAsync,
    Options,
    Prettify,
    ReactiveArray, ReactiveObject, Root,
    Scheduler, Signal, State,
    Type
};
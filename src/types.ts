import { Function, NeverAsync, Prettify } from '@esportsplus/typescript'
import { CHECK, CLEAN, COMPUTED, DIRTY, DISPOSED, EFFECT, ROOT, SIGNAL } from './constants';
import { Reactive } from './signal';


type Base<T> = Omit<Reactive<T>, 'changed' | 'fn' | 'get' | 'scheduler' | 'set' | 'task' | 'tracking'>;

type Changed = (a: unknown, b: unknown) => boolean;

type Computed<T> = {
    changed: Changed;
    fn: NeverAsync<() => T>;
    get(): T;
} & Base<T>;

type Effect = {
    fn: NeverAsync<(node: Effect) => void>;
    root: Root;
    task: Function;
} & Omit<Base<void>, 'value'>;

type Event = string;

type Listener<D> = {
    once?: boolean;

    <V>(event: { data?: D, value: V }): void;
};

type Object = Record<PropertyKey, unknown>;

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


export type { Changed, Computed, Effect, Event, Function, Listener, Object, Options, NeverAsync, Prettify, Root, Scheduler, Signal, State, Type };
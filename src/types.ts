import { Prettify } from '@esportsplus/typescript'
import { CHECK, CLEAN, COMPUTED, DIRTY, DISPOSED, EFFECT, SIGNAL } from './constants';
import Signal from './signal';


type Changed = (a: unknown, b: unknown) => boolean;

type Computed<T> = {
    fn: T extends Promise<unknown> ? never : ((previous: T) => T);
    value: ReturnType<Computed<T>['fn']>;
} & Omit<Signal<T>, 'fn' | 'value'>;

type Effect<T> = {
    fn: (node: Effect<T>) => void;
    root: NonNullable<Signal<T>['root']>;
    task: NonNullable<Signal<T>['task']>
    value: void;
} & Omit<Signal<T>, 'fn' | 'root' | 'task' | 'value'>;

type Event = string;

type Listener<D> = {
    once?: boolean;

    <V>(event: { data?: D, value: V }): void;
};

type Object = Record<PropertyKey, unknown>;

type Options = {
    changed?: Changed;
    value?: unknown;
};

type Root = {
    scheduler: Scheduler
};

type Scheduler = (fn: (...args: unknown[]) => Promise<unknown> | unknown) => unknown;

type State = typeof CHECK | typeof CLEAN | typeof DIRTY | typeof DISPOSED;

type Type = typeof COMPUTED | typeof EFFECT | typeof SIGNAL;


export { Changed, Computed, Effect, Event, Listener, Object, Options, Prettify, Root, Scheduler, Signal, State, Type };
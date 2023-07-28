import { Function, Prettify, SyncFunction } from '@esportsplus/typescript'
import { CHECK, CLEAN, COMPUTED, DIRTY, DISPOSED, EFFECT, SIGNAL } from './constants';
import Signal from './signal';


type Changed = (a: unknown, b: unknown) => boolean;

type Computed<T> = {
    fn: SyncFunction<(previous: T) => T>;
} & Omit<Signal<T>, 'fn'>;

type Effect = {
    fn: SyncFunction<(node: Effect) => void>;
    root: Root;
    task: Function
    value: void;
} & Omit<Signal<void>, 'fn' | 'root' | 'task' | 'value'>;

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

type Scheduler = (fn: Function) => unknown;

type State = typeof CHECK | typeof CLEAN | typeof DIRTY | typeof DISPOSED;

type Type = typeof COMPUTED | typeof EFFECT | typeof SIGNAL;


export { Changed, Computed, Effect, Event, Listener, Object, Options, Prettify, Root, Scheduler, Signal, State, SyncFunction, Type };
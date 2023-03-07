import { CHECK, CLEAN, COMPUTED, DIRTY, DISPOSED, EFFECT, NODE, NODES, SIGNAL } from './symbols';
import S from './signal';


type Changed = (a: unknown, b: unknown) => boolean;

type Computed<T = unknown> = {
    fn: NonNullable<Signal<T>['fn']>
} & Signal<T>;

type Effect<T = unknown> = {
    root: NonNullable<Signal<T>['root']>;
    task: NonNullable<Signal<T>['task']>
} & Computed<T>;

type Fn<T> = () => T;

type Infer<T> =
    T extends (...args: any[]) => any
        ? ReturnType<T>
        : T extends Record<string, unknown>
            ? { [K in keyof T]: Infer<T[K]> }
            : T;

type Listener = <T>(value: T) => void;

type Options = {
    changed?: Changed;
};

type Root = {
    scheduler: Scheduler
};

type Scheduler = (fn: (...args: unknown[]) => Promise<unknown> | unknown) => unknown;

type Signal<T = unknown> = S<T>;

type State = typeof CHECK | typeof CLEAN | typeof DIRTY | typeof DISPOSED;

type Type = typeof COMPUTED | typeof EFFECT | typeof SIGNAL;

type Wrapper = {
    [NODE]?: Signal,
    [NODES]?: Signal[]
};


export { Changed, Computed, Effect, Fn, Infer, Listener, Options, Root, Scheduler, Signal, State, Type, Wrapper };
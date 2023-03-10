import { CHECK, CLEAN, COMPUTED, DIRTY, DISPOSED, EFFECT, SIGNAL } from './symbols';
import Signal from './signal';


type Changed = (a: unknown, b: unknown) => boolean;

type Computed<T> = {
    fn: T extends Promise<unknown> ? never : ((this: Context, previous: T) => T);
    value: ReturnType<Computed<T>['fn']>;
} & Omit<Signal<T>, 'fn' | 'value'>;

type Context = {
    dispose(): void;
    on(event: Event, listener: Listener): void;
    once(event: Event, listener: Listener): void;
    reset(): void;
};

type Effect<T> = {
    fn: (this: Context, previous: T) => T;
    root: NonNullable<Signal<T>['root']>;
    task: NonNullable<Signal<T>['task']>
} & Omit<Computed<T>, 'fn' | 'root' | 'task'>;

type Event = symbol;

type Infer<T> =
    T extends (...args: any[]) => any
        ? ReturnType<T>
        : T extends Record<PropertyKey, unknown>
            ? { [K in keyof T]: Infer<T[K]> }
            : T;

type Listener = {
    once?: boolean;

    <T>(value: T): void;
};

type Options = {
    changed?: Changed;
};

type Root = {
    scheduler: Scheduler
};

type Scheduler = (fn: (...args: unknown[]) => Promise<unknown> | unknown) => unknown;

type State = typeof CHECK | typeof CLEAN | typeof DIRTY | typeof DISPOSED;

type Type = typeof COMPUTED | typeof EFFECT | typeof SIGNAL;


export { Changed, Computed, Context, Effect, Event, Infer, Listener, Options, Root, Scheduler, Signal, State, Type };
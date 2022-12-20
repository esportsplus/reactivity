import { CLEAN, CHECK, DIRTY } from './symbols';


type Fn = () => Promise<unknown> | unknown;

type Infer<T> =
    T extends (...args: any[]) => any
        ? ReturnType<T>
        : T extends Record<string, Primitives>
            ? { [K in keyof T]: Infer<T[K]> }
            : T;

type Primitives = any[] | boolean | number | string | null | undefined | ((...args: any[]) => any);

type ReactiveFn<T> = (onCleanup?: (fn: VoidFunction) => void) => T;

type Scheduler = {
    schedule(): void;
    tasks: {
        add: (fn: Fn) => void;
        delete: (fn: Fn) => void;
    }
};

type State = typeof CHECK | typeof CLEAN | typeof DIRTY;


export { Infer, ReactiveFn, Scheduler, State };
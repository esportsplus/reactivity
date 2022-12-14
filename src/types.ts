import { CLEAN, CHECK, DIRTY } from './symbols';
import Reactive from './reactive';


type Fn = () => Promise<unknown> | unknown;

type Infer<T> =
    T extends (...args: any[]) => any
        ? Reactive<T>
        : T extends Record<string, any>
                ? InferNested<T>
                : Reactive<T>;

type Primitives = any[] | boolean | number | string | null | undefined | ((...args: any[]) => any);

type InferNested<T> =
    T extends (...args: any[]) => any
        ? ReturnType<T>
        : T extends Record<string, Primitives>
            ? { [K in keyof T]: InferNested<T[K]> }
            : T;

type Scheduler = {
    schedule(): void;
    tasks: {
        add: (fn: Fn) => void;
        delete: (fn: Fn) => void;
    }
};

type State = typeof CHECK | typeof CLEAN | typeof DIRTY;


export { Infer, Scheduler, State };
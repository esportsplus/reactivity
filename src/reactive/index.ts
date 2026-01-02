import { REACTIVE_OBJECT } from '~/constants';
import { ReactiveArray } from './array';


type Guard<T> = T extends { dispose: any } ? { never: '[ dispose ] is a reserved key' } : T;

type ReactiveObject<T extends Record<PropertyKey, unknown>> = T & {
    [REACTIVE_OBJECT]: true;
    dispose(): void;
};


// Overloads for compile-time type discrimination
function reactive<T extends Record<PropertyKey, any>>(obj: Guard<T>): ReactiveObject<T>;
function reactive<T>(arr: T[]): ReactiveArray<T>;
function reactive(_input: unknown): unknown {
    throw new Error(
        '@esportsplus/reactivity: reactive() called at runtime. ' +
        'Ensure vite-plugin-reactivity-compile is configured.'
    );
}


export default reactive;
export { reactive, ReactiveArray };
export type { ReactiveObject };

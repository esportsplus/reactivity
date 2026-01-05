import { Prettify } from '@esportsplus/utilities';
import { REACTIVE_OBJECT } from '~/constants';
import { ReactiveArray } from './array';


// Branded type to prevent assignment to computed values
declare const READONLY: unique symbol;

type Infer<T> =
    T extends (...args: unknown[]) => Promise<infer R>
        ? R | undefined
        : T extends (...args: any[]) => infer R
            ? R
            : T extends (infer U)[]
                ? ReactiveArray<U>
                : T extends ReactiveObject<any>
                    ? T
                    : T extends Record<PropertyKey, unknown>
                        ? { [K in keyof T]: T[K] }
                        : T;

type ReactiveObject<T> =
    T extends Record<PropertyKey, unknown>
        ? Prettify<{ [K in keyof T]: Infer<T[K]> } & {
            [REACTIVE_OBJECT]: true;
            dispose: VoidFunction
        }>
        : T extends (infer U)[]
            ? ReactiveArray<U>
            : never;

type ReactiveObjectGuard<T> = T extends { dispose: any } ? { never: '[ dispose ] is a reserved key' } : T;


// Function input → branded return type (prevents assignment)
function reactive<T extends () => unknown>(_input: T): ReturnType<T> & { readonly [READONLY]: true };
// Object literal → existing ReactiveObject behavior
function reactive<T extends Record<PropertyKey, any>>(_input: ReactiveObjectGuard<T>): ReactiveObject<T>;
// Array literal → existing ReactiveArray behavior
function reactive<T>(_input: T[]): ReactiveArray<T>;
// Everything else → passthrough type (allows assignment)
function reactive<T>(_input: T): T {
    throw new Error(
        '@esportsplus/reactivity: reactive() called at runtime. ' +
        'Ensure vite-plugin-reactivity-compile is configured.'
    );
}


export default reactive;
export { reactive, ReactiveArray };
export type { ReactiveObject };

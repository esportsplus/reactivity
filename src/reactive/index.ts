import { REACTIVE_OBJECT } from '~/constants';
import { ReactiveArray } from './array';


// Branded type to prevent assignment to computed values
declare const READONLY: unique symbol;

type ReactiveObject<T extends Record<PropertyKey, unknown>> = T & {
    [REACTIVE_OBJECT]: true;
    dispose(): void;
};

type ReactiveObjectGuard<T> = T extends { dispose: any } ? { never: '[ dispose ] is a reserved key' } : T;


// Function input → branded return type (prevents assignment)
function reactive<T extends () => unknown>(_input: T): ReturnType<T> & { readonly [READONLY]: true };
// Object literal → existing ReactiveObject behavior
function reactive<T extends Record<PropertyKey, any>>(_input: ReactiveObjectGuard<T>): ReactiveObject<T>;
// Array literal → existing ReactiveArray behavior
function reactive<T>(_input: T[]): ReactiveArray<T>;
// Everything else → passthrough type (allows assignment)
function reactive<T>(_input: T): T;
function reactive(_input: unknown): unknown {
    throw new Error(
        '@esportsplus/reactivity: reactive() called at runtime. ' +
        'Ensure vite-plugin-reactivity-compile is configured.'
    );
}


export default reactive;
export { reactive, ReactiveArray };
export type { ReactiveObject };

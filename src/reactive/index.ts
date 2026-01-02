import { REACTIVE_OBJECT } from '~/constants';
import { ReactiveArray } from './array';


// Branded type to prevent assignment to computed values
declare const COMPUTED_BRAND: unique symbol;

// TODO: Rewrite to readonly T
type ComputedValue<T> = T & { readonly [COMPUTED_BRAND]: true };

type Guard<T> = T extends { dispose: any } ? { never: '[ dispose ] is a reserved key' } : T;

type ReactiveObject<T extends Record<PropertyKey, unknown>> = T & {
    [REACTIVE_OBJECT]: true;
    dispose(): void;
};


// Overloaded reactive() signature per spec
// Function input → branded return type (prevents assignment)
function reactive<T extends () => unknown>(fn: T): ComputedValue<ReturnType<T>>;
// Object literal → existing ReactiveObject behavior
function reactive<T extends Record<PropertyKey, any>>(obj: Guard<T>): ReactiveObject<T>;
// Array literal → existing ReactiveArray behavior
function reactive<T>(arr: T[]): ReactiveArray<T>;
// Everything else → passthrough type (allows assignment)
function reactive<T>(value: T): T;
function reactive(_input: unknown): unknown {
    throw new Error(
        '@esportsplus/reactivity: reactive() called at runtime. ' +
        'Ensure vite-plugin-reactivity-compile is configured.'
    );
}


export default reactive;
export { reactive, ReactiveArray };
export type { ComputedValue, ReactiveObject };

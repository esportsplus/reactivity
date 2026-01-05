import { Prettify } from '@esportsplus/utilities';
import { ReactiveArray } from './array';
import { PACKAGE } from '~/constants';
import { Reactive } from '~/types';


// Branded type to prevent assignment to computed values
declare const READONLY: unique symbol;

type Guard<T> =
    T extends Record<PropertyKey, unknown>
        ? T extends { dispose: any }
            ? { never: '[ dispose ] is a reserved key' }
            : T
        : never;

type Infer<T> =
    T extends (...args: unknown[]) => Promise<infer R>
        ? R | undefined
        : T extends (...args: any[]) => infer R
            ? R
            : T extends (infer U)[]
                ? U[] & Pick<ReactiveArray<U>, 'clear' | 'on' | 'once'>
                : T extends ReactiveObject<any>
                    ? T
                    : T extends Record<PropertyKey, unknown>
                        ? { [K in keyof T]: T[K] }
                        : T;

type ReactiveObject<T> =
    T extends Record<PropertyKey, unknown>
        ? Reactive< Prettify<{ [K in keyof T]: Infer<T[K]> } & { dispose: VoidFunction }> >
        : T extends (infer U)[]
            ? U[] & Pick<ReactiveArray<U>, 'clear' | 'on' | 'once'>
            : never;


function reactive<T extends () => unknown>(_input: T): Reactive< ReturnType<T> & { readonly [READONLY]: true } >;
function reactive<T extends Record<PropertyKey, any>>(_input: Guard<T>): ReactiveObject<T>;
function reactive<T>(_input: T[]): Reactive< T[] & Pick<ReactiveArray<T>, 'clear' | 'on' | 'once'> >;
function reactive<T>(_input: T): Reactive<T> {
    throw new Error(
        `${PACKAGE}: reactive() called at runtime. ` +
        'Ensure vite-plugin-reactivity-compile is configured.'
    );
}


export default reactive;
export { reactive, ReactiveArray };
export type { Reactive, ReactiveObject };

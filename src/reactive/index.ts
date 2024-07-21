import { Prettify } from '@esportsplus/typescript';
import { Options } from '~/types';
import { default as array, ReactiveArray } from './array';
import { default as object, ReactiveObject } from './object';
import { isArray, isObject } from '~/utilities';


type Guard<T> =
    T extends Record<PropertyKey, unknown>
        ? { [K in keyof T]: Never<K, Guard<T[K]>> }
        : T extends unknown[]
            ? T
            : never;

type Infer<T> =
    T extends (...args: unknown[]) => unknown
        ? ReturnType<T>
        : T extends (infer U)[]
            ? Prettify< Omit<U[], 'map'> & Pick<ReactiveArray<U>, 'dispatch' | 'dispose' | 'map' | 'on' | 'once'> >
            : T extends Record<PropertyKey, unknown>
                ? { [K in keyof T]: T[K] }
                : T;

type Never<K,V> = K extends keyof ReactiveObject<Record<PropertyKey, unknown>> ? never : V;


export default <T>(data: Guard<T>, options: Options = {}) => {
    let value;

    if (isArray(data)) {
        value = array(data, options);
    }
    else if (isObject(data)) {
        value = object(data as { [K in keyof T]: T[K] }, options);
    }
    else {
        throw new Error('Reactivity: received invalid input for `reactive()`', data);
    }

    return value as T extends Record<PropertyKey, unknown> ? { [K in keyof T]: Infer<T[K]> } : Infer<T>;
};
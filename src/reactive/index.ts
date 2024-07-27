import { isArray, isObject } from '@esportsplus/utilities';
import { Options, ReactiveArray, ReactiveObject } from '~/types';
import { default as array } from './array';
import { default as object } from './object';


type Guard<T> =
    T extends { dispose: any } | { signals: any }
        ? { never: '[ dispose, signals ] are reserved keys' }
        : T extends Record<PropertyKey, unknown> | unknown[]
            ? T
            : never;


export default <T>(data: Guard<T>, options: Options = {}) => {
    let value;

    if (isArray(data)) {
        value = array(data, options);
    }
    else if (isObject(data)) {
        value = object(data as { [K in keyof T]: T[K] }, options);
    }
    else {
        throw new Error(`Reactivity: 'reactive' received invalid input - ${JSON.stringify(data)}`);
    }

    return value as T extends Record<PropertyKey, unknown>
        ? ReactiveObject<T>
        : ReactiveArray<T>;
};
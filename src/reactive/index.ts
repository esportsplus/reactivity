import { isArray, isObject, isPromise } from '@esportsplus/utilities';
import { Reactive } from '~/types';
import array from './array';
import object from './object';
import promise from './promise';


type Guard<T> =
    T extends (...args: unknown[]) => Promise<unknown>
        ? T
        : T extends { dispose: any } | { signals: any }
            ? { never: '[ dispose, signals ] are reserved keys' }
            : T extends Record<PropertyKey, unknown> | unknown[]
                ? T
                : never;


export default <T>(data: Guard<T>) => {
    let value;

    if (isArray(data)) {
        value = array(data);
    }
    else if (isObject(data)) {
        value = object(data);
    }
    else if (isPromise(data)) {
        value = promise(data);
    }
    else {
        throw new Error(`@esportsplus/reactivity: 'reactive' received invalid input - ${JSON.stringify(data)}`);
    }

    return value as Reactive<T>;
};
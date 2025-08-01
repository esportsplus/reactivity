import { isArray, isObject, isPromise } from '@esportsplus/utilities';
import array from './array';
import object from './object';
import promise from './promise';


type API<T> =
    T extends (...args: infer A) => Promise<infer R>
        ? ReturnType<typeof promise<A, Promise<R>>>
        : T extends Record<PropertyKey, unknown>
            ? ReturnType<typeof object<T>>
            : T extends unknown[]
                ? ReturnType<typeof array<T>>
                : never;

type Guard<T> =
    T extends (...args: unknown[]) => Promise<unknown>
        ? T
        : T extends { dispose: any } | { signals: any }
            ? { never: '[ dispose, signals ] are reserved keys' }
            : T extends Record<PropertyKey, unknown> | unknown[]
                ? T
                : never;


export default <T>(data: Guard<T>): API<T> => {
    if (isArray(data)) {
        return array(data) as API<T>;
    }
    else if (isObject(data)) {
        return object(data) as API<T>;
    }
    else if (isPromise(data)) {
        return promise(data) as API<T>;
    }

    throw new Error(`@esportsplus/reactivity: 'reactive' received invalid input - ${JSON.stringify(data)}`);
};
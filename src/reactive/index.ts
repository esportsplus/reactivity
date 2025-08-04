import { isArray, isObject } from '@esportsplus/utilities';
import array from './array';
import object from './object';


type API<T> =
    T extends Record<PropertyKey, unknown>
        ? ReturnType<typeof object<T>>
        : T extends unknown[]
            ? ReturnType<typeof array<T>>
            : never;

type Input<T> =
    T extends { dispose: any } | { signals: any }
        ? { never: '[ dispose, signals ] are reserved keys' }
        : T extends Record<PropertyKey, unknown> | unknown[]
                ? T
                : never;


export default <T>(input: Input<T>): API<T> => {
    if (isArray(input)) {
        return array(input) as API<T>;
    }
    else if (isObject(input)) {
        return object(input) as API<T>;
    }

    throw new Error(`@esportsplus/reactivity: 'reactive' received invalid input - ${JSON.stringify(input)}`);
};
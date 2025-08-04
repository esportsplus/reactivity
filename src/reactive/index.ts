import { isArray, isObject, NeverAsync } from '@esportsplus/utilities';
import array from './array';
import object from './object';


type API<T> =
    T extends Record<PropertyKey, unknown>
        ? ReturnType<typeof object<T>>
        : T extends unknown[]
            ? ReturnType<typeof array<T>>
            : never;

type Input<T> =
    T extends unknown[]
        ? T
        : T extends { dispose: any } | { signals: any }
            ? { never: '[ dispose, signals ] are reserved keys' }
            : T extends Record<PropertyKey, unknown>
                    ? {
                        [K in keyof T]:
                            T[K] extends (...args: unknown[]) => ((...args: unknown[]) => Promise<unknown>)
                                ? T[K]
                                : T[K] extends (...args: unknown[]) => unknown
                                    ? NeverAsync<T[K]>
                                    : T[K]
                    }
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
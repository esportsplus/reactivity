import { isArray, isObject, Prettify } from '@esportsplus/utilities';
import { onCleanup, root } from '~/system';
import { ReactiveArray } from './array';
import { ReactiveObject } from './object';


type API<T> =
    T extends Record<PropertyKey, unknown>
        ? Prettify<{ [K in keyof T]: Infer<T[K]> } & { dispose: VoidFunction } >
        : T extends (infer U)[]
            ? ReactiveArray<U>
            : never;

type Guard<T> = T extends { dispose: any } ? { never: '[ dispose ] are reserved keys' } : T;

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


export default <T extends Record<PropertyKey, any> | unknown[]>(input: Guard<T>): API<T> => {
    let dispose = false,
        value = root(() => {
            let response: API<T> | undefined;

            if (isObject(input)) {
                response = new ReactiveObject(input) as any as API<T>;
            }
            else if (isArray(input)) {
                response = new ReactiveArray(...input) as API<T>;
            }

            if (response) {
                if (root.disposables) {
                    dispose = true;
                }

                return response;
            }

            throw new Error(`@esportsplus/reactivity: 'reactive' received invalid input - ${JSON.stringify(input)}`);
        });

    if (dispose) {
        onCleanup(() => value.dispose());
    }

    return value;
};
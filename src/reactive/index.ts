import { isArray, isObject } from '@esportsplus/utilities';
import { onCleanup, root } from '~/system';
import array from './array';
import object from './object';


type API<T> =
    T extends Record<PropertyKey, unknown>
        ? ReturnType<typeof object<T>>
        : T extends unknown[]
            ? ReturnType<typeof array<T>>
            : never;

type Input<T> =
    T extends { dispose: any }
        ? never
        : T extends Record<PropertyKey, unknown>
            ? T
            : T extends unknown[]
                ? Input<T[number]>[]
                : never;


export default <T extends Record<PropertyKey, unknown> | unknown[]>(input: Input<T>): API<T> => {
    let value: API<T> | undefined;

    return root(() => {
        if (isArray(input)) {
            value = array(input) as API<T>;
        }
        else if (isObject(input)) {
            value = object(input) as API<T>;
        }

        if (value) {
            if (root.disposables) {
                onCleanup(() => value!.dispose());
            }

            return value;
        }

        throw new Error(`@esportsplus/reactivity: 'reactive' received invalid input - ${JSON.stringify(input)}`);
    });
};
export type { Input };
import { isArray, isObject } from '@esportsplus/utilities';
import { onCleanup, root } from '~/system';
import array, { ReactiveArray } from './array';
import object, { ReactiveObject } from './object';


type API<T> =
    T extends Record<PropertyKey, unknown>
        ? ReactiveObject<T>
        : T extends (infer U)[]
            ? ReactiveArray<U>
            : never;


export default <T extends Record<PropertyKey, any> | unknown[]>(
    input: T extends { dispose: any } ? { never: '[ dispose ] are reserved keys' } : T
): API<T> => {
    let dispose = false,
        value = root(() => {
            let response: API<T> | undefined;

            if (isArray(input)) {
                response = array(input) as API<T>;
            }
            else if (isObject(input)) {
                response = object(input) as API<T>;
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
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
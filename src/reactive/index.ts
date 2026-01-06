import { onCleanup, root } from '@esportsplus/reactivity';
import { isArray, isObject } from '@esportsplus/utilities';
import { Reactive } from '~/types';
import { ReactiveArray } from './array';
import { ReactiveObject } from './object';
import { PACKAGE } from '~/constants';


type Guard<T> =
    T extends Record<PropertyKey, unknown>
        ? T extends { dispose: any }
            ? { never: '[ dispose ] is a reserved key' }
            : T
        : never;


function reactive<T extends unknown[]>(input: T): Reactive<T>;
function reactive<T extends Record<PropertyKey, unknown>>(input: Guard<T>): Reactive<T>;
function reactive<T extends unknown[] | Record<PropertyKey, unknown>>(input: T): Reactive<T> {
    let dispose = false,
        value = root(() => {
            let response: Reactive<T> | undefined;

            if (isObject(input)) {
                response = new ReactiveObject(input) as any as Reactive<T>;
            }
            else if (isArray(input)) {
                response = new ReactiveArray(...input) as any as Reactive<T>;
            }

            if (response) {
                if (root.disposables) {
                    dispose = true;
                }

                return response;
            }

            throw new Error(`${PACKAGE}: 'reactive' received invalid input - ${JSON.stringify(input)}`);
        });

    if (dispose) {
        onCleanup(() => value.dispose());
    }

    return value;
}


export default reactive;
export { reactive, ReactiveArray, ReactiveObject };

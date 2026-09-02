import { onCleanup, root } from '@esportsplus/reactivity';
import { isArray, isObject } from '@esportsplus/utilities';
import { PACKAGE_NAME } from '~/constants';
import type { Reactive } from '~/types';
import { ReactiveArray } from './array';
import { ReactiveObject } from './object';


type Guard<T> =
    T extends Record<PropertyKey, unknown>
        ? T extends { dispose: unknown }
            ? { never: '[ dispose ] is a reserved key' }
            : T
        : never;


function reactive<T extends unknown[]>(input: T): Reactive<T>;
function reactive<T extends Record<PropertyKey, unknown>>(input: Guard<T>): Reactive<T>;
function reactive<T>(input: T): Reactive<T>;
function reactive<T>(input: T): Reactive<T> {
    let value = root(() => {
            if (isObject(input)) {
                return new ReactiveObject(input) as unknown as Reactive<T>;
            }

            if (isArray(input)) {
                return new ReactiveArray(...input) as unknown as Reactive<T>;
            }

            throw new Error(`${PACKAGE_NAME}: 'reactive' received invalid input - ${JSON.stringify(input)}`);
        });

    onCleanup(() => (value as unknown as { dispose: VoidFunction }).dispose());

    return value;
}


export default reactive;
export { reactive, ReactiveArray, ReactiveObject };

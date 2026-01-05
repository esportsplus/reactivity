import { ReactiveArray } from './array';
import { COMPILER_ENTRYPOINT, PACKAGE } from '~/constants';
import { Reactive } from '~/types';


type Guard<T> =
    T extends Record<PropertyKey, unknown>
        ? T extends { dispose: any }
            ? { never: '[ dispose ] is a reserved key' }
            : T
        : never;


function reactive<T extends Record<PropertyKey, any>>(_input: Guard<T>): Reactive<T>;
function reactive<T>(_input: T): Reactive<T> {
    throw new Error(
        `${PACKAGE}: ${COMPILER_ENTRYPOINT}() called at runtime. ` +
        'Ensure vite plugin is configured.'
    );
}


export default reactive;
export { reactive, ReactiveArray };

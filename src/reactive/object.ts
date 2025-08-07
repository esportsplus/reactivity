import { defineProperty, isArray, isFunction, isObject, isPromise, Prettify } from '@esportsplus/utilities';
import { computed, dispose, effect, isComputed, read, root, set, signal } from '~/system';
import { Computed, Infer, Signal } from '~/types';
import { REACTIVE_OBJECT } from '~/constants';
import array, { isReactiveArray } from './array';


type API<T extends Record<PropertyKey, unknown>> = Prettify<{ [K in keyof T]: Infer<T[K]> }> & ReactiveObject<T>;


class ReactiveObject<T extends Record<PropertyKey, unknown>> {
    [REACTIVE_OBJECT] = true;


    constructor(data: T) {
        for (let key in data) {
            let value = data[key];

            if (isArray(value)) {
                let a = array(value);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        return a;
                    }
                });
            }
            else if (isFunction(value)) {
                let c: Computed<T[typeof key]> | Signal<T[typeof key] | undefined> | undefined;

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        if (c === undefined) {
                            root(() => {
                                c = computed(value as Computed<T[typeof key]>['fn']);

                                if (isPromise(c.value)) {
                                    let factory = c,
                                        version = 0;

                                    c = signal(undefined);

                                    effect(() => {
                                        let id = ++version;

                                        (read(factory) as Promise<T[typeof key]>).then((value) => {
                                            if (id !== version) {
                                                return;
                                            }

                                            set(c as Signal<typeof value>, value);
                                        });
                                    });
                                }
                            });
                        }

                        return read(c!);
                    }
                });
            }
            else {
                let s = signal(value);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        return read(s);
                    },
                    set(v: typeof value) {
                        set(s, v);
                    }
                });
            }
        }
    }


    dispose() {
        let value;

        for (let key in this) {
            value = this[key];

            if (isReactiveArray(value) || isReactiveObject(value)) {
                value.dispose();
            }
            else if (isComputed(value)) {
                dispose(value);
            }
        }
    }
}


const isReactiveObject = (value: any): value is ReactiveObject<any> => {
    return isObject(value) && REACTIVE_OBJECT in value;
};


export default <T extends Record<PropertyKey, unknown>>(input: T) => {
    return new ReactiveObject<T>(input) as API<T>;
};
export { isReactiveObject };
export type { API as ReactiveObject };
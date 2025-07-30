import { defineProperty, isArray, isFunction, isObject } from '@esportsplus/utilities';
import { computed, signal } from '~/signal';
import { Computed, Infer, Options, Prettify, ReactiveArray, Signal } from '~/types';
import { default as array } from './array';


type API<T> = Prettify< { [K in keyof T]: Infer<T[K]> } & { dispose: VoidFunction } >;


class ReactiveObject<T extends Record<PropertyKey, unknown>> {
    signals: Record<PropertyKey, Computed<any> | ReactiveArray<any> | ReactiveObject<any> | Signal<any>> = {};


    constructor(data: T, options: Options = {}) {
        let signals = this.signals;

        for (let key in data) {
            let value = data[key];

            if (isArray(value)) {
                let s = signals[key] = array(value, options);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        return s;
                    }
                });
            }
            else if (isFunction(value)) {
                let s = signals[key] = computed(value as Computed<T>['fn'], options);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        return s.get();
                    }
                });
            }
            else if (isObject(value)) {
                // Type issue with factory function below, fix after testing, if this is kept
                let s = signals[key] = new ReactiveObject(value, options);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        return s;
                    }
                });
            }
            else {
                let s = signals[key] = signal(value, options);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        return s.get();
                    },
                    set(value) {
                        s.set(value);
                    }
                });
            }
        }
    }


    dispose() {
        let signals = this.signals;

        for (let key in signals) {
            signals[key].dispose();
        }
    }
}


export default function object<T extends Record<PropertyKey, unknown>>(input: T, options: Options = {}) {
    return new ReactiveObject(input, options) as API<T>;
};
export type { API as ReactiveObject };
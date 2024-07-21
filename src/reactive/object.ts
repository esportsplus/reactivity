import { computed, signal } from '~/signal';
import { Computed, Options, Signal } from '~/types';
import { defineProperty, isArray, isFunction } from '~/utilities';
import { default as array, ReactiveArray } from './array';


class ReactiveObject<T extends Record<PropertyKey, unknown>> {
    signals: Record<PropertyKey, Computed<any> | ReactiveArray<any> | Signal<any>> = {};


    constructor(data: T, options: Options = {}) {
        let signals = this.signals;

        for (let key in data) {
            let input = data[key];

            if (isArray(input)) {
                let s = signals[key] = array(input, options);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        return s;
                    }
                });
            }
            else if (isFunction(input)) {
                let s = signals[key] = computed(input as Computed<T>['fn'], options);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        return s.get();
                    }
                });
            }
            else {
                let s = signals[key] = signal(input, options);

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


    get value() {
        return this;
    }


    dispose() {
        let signals = this.signals;

        for (let key in signals) {
            signals[key].dispose();
        }
    }
}


export default <T extends Record<PropertyKey, unknown>>(input: T, options: Options = {}) => {
    return new ReactiveObject(input, options);
};
export { ReactiveObject };
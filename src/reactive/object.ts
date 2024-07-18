import { computed, signal } from '~/signal';
import { Computed, Object, Options, Signal } from '~/types';
import { defineProperty, isArray } from '~/utilities';
import { ReactiveArray, ReactiveObjectArray } from './array';


type Node = Computed<any> | ReactiveArray<any> | ReactiveObjectArray<Object> | Signal<any>;


class ReactiveObject<T extends Object> {
    signals: Record<PropertyKey, Node> = {};


    constructor(data: T, options: Options = {}) {
        let signals = this.signals;

        for (let key in data) {
            let input = data[key];

            if (typeof input === 'function') {
                let s = signals[key] = computed(input as Computed<T>['fn'], options);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        return s.get();
                    }
                });
            }
            else if (isArray(input)) {
                let s: ReactiveArray<unknown> | ReactiveObjectArray<Object>,
                    test = input[0];

                if (typeof test === 'object' && test !== null && test?.constructor?.name === 'Object') {
                    s = signals[key] = new ReactiveObjectArray(input, options);
                }
                else {
                    s = signals[key] = new ReactiveArray(input);
                }

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        s.track();

                        return s;
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


    dispose() {
        let signals = this.signals;

        for (let key in signals) {
            signals[key].dispose();
        }
    }
}


export { ReactiveObject };
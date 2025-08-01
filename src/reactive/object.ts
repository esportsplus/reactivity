import { defineProperty, isArray, isFunction, isInstanceOf, isObject, Prettify } from '@esportsplus/utilities';
import array, { ReactiveArray } from './array';
import { computed, dispose, isComputed, read, signal } from '~/signal';
import { Computed, Infer, Signal } from '~/types';
import { Disposable } from './disposable';


type API<T extends Record<PropertyKey, unknown>> = Prettify<{ [K in keyof T]: Infer<T[K]> }> & ReactiveObject<T>;


let { set } = signal;


class ReactiveObject<T extends Record<PropertyKey, unknown>> extends Disposable {
    private signals: Record<
        PropertyKey,
        Computed<any> | ReactiveArray<any> | ReactiveObject<any> | Signal<any>
    > = {};


    constructor(data: T) {
        super();

        let signals = this.signals,
            triggers: Record<string, Signal<boolean>> = {};

        for (let key in data) {
            let value = data[key];

            if (isArray(value)) {
                let s = signals[key] = array(value),
                    t = triggers[key] = signal(false);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        read(t);
                        return s;
                    },
                    set(v: typeof value) {
                        set(t, !!t.value);
                        s = signals[key] = array(v);
                    }
                });
            }
            else if (isFunction(value)) {
                let s = signals[key] = computed(value as Computed<T>['fn']);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        return read(s as Computed<T>);
                    }
                });
            }
            else if (isObject(value)) {
                let s = signals[key] = new ReactiveObject(value),
                    t = triggers[key] = signal(false);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        read(t);
                        return s;
                    },
                    set(v: typeof value) {
                        set(t, !!t.value);
                        s = signals[key] = new ReactiveObject(v);
                    }
                });
            }
            else {
                let s = signals[key] = signal(value);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        if (s === undefined) {
                            s = signals[key] = signal(value);
                        }

                        return read(s as Signal<typeof value>);
                    },
                    set(v: typeof value) {
                        set(s, v);
                    }
                });
            }
        }
    }


    dispose() {
        for (let key in this.signals) {
            let value = this.signals[key];

            if (isInstanceOf(value, Disposable)) {
                value.dispose();
            }
            else if (isComputed(value)) {
                dispose(value);
            }
        }

        this.signals = {};
    }
}


export default function object<T extends Record<PropertyKey, unknown>>(input: T) {
    return new ReactiveObject(input) as API<T>;
};
export { ReactiveObject };
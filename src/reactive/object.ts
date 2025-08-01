import { defineProperty, isArray, isAsyncFunction, isFunction, isInstanceOf, isObject, Prettify } from '@esportsplus/utilities';
import array, { ReactiveArray } from './array';
import { computed, dispose, read, signal } from '~/signal';
import { Computed, Infer, Signal } from '~/types';
import { Disposable } from './disposable';
import promise from './promise';


type API<T extends Record<PropertyKey, unknown>> = Prettify<{ [K in keyof T]: Infer<T[K]> }> & ReactiveObject<T>;


let { set } = signal;


class ReactiveObject<T extends Record<PropertyKey, unknown>> extends Disposable {
    private disposable: Record<
        PropertyKey,
        Computed<any> | ReactiveArray<any> | ReactiveObject<any>
    > = {};


    constructor(data: T) {
        super();

        let disposable = this.disposable,
            triggers: Record<string, Signal<boolean>> = {};

        for (let key in data) {
            let value = data[key];

            if (isArray(value)) {
                let a = disposable[key] = array(value),
                    t = triggers[key] = signal(false);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        read(t);
                        return a;
                    },
                    set(v: typeof value) {
                        set(t, !!t.value);
                        a = disposable[key] = array(v);
                    }
                });
            }
            if (isAsyncFunction(value)) {
                let p = promise(value);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        return p;
                    }
                });
            }
            else if (isFunction(value)) {
                let c = disposable[key] = computed(value as Computed<T>['fn']);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        return read(c as Computed<T>);
                    }
                });
            }
            else if (isObject(value)) {
                let o = disposable[key] = new ReactiveObject(value),
                    t = triggers[key] = signal(false);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        read(t);
                        return o;
                    },
                    set(v: typeof value) {
                        set(t, !!t.value);
                        o = disposable[key] = new ReactiveObject(v);
                    }
                });
            }
            else {
                let s = signal(value);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        if (s === undefined) {
                            s = signal(value);
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
        for (let key in this.disposable) {
            let value = this.disposable[key];

            if (isInstanceOf(value, Disposable)) {
                value.dispose();
            }
            else {
                dispose(value);
            }
        }

        this.disposable = {};
    }
}


export default function object<T extends Record<PropertyKey, unknown>>(input: T) {
    return new ReactiveObject(input) as API<T>;
};
export type { API as ReactiveObject };
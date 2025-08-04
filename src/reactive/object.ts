import { defineProperty, isArray, isAsyncFunction, isFunction, isInstanceOf, Prettify } from '@esportsplus/utilities';
import array, { ReactiveArray } from './array';
import { computed, dispose, effect, read, signal } from '~/system';
import { Computed, Infer, Signal } from '~/types';
import { Disposable } from './disposable';


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
                        a = disposable[key] = array(v);
                        set(t, !!t.value);
                    }
                });
            }
            else if (isFunction(value)) {
                let c: Computed<T[typeof key]> | Signal<T[typeof key] | null> | undefined;

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        if (c === undefined) {
                            c = disposable[key] = computed(value as Computed<T[typeof key]>['fn']);

                            if (isAsyncFunction(c.value)) {
                                let factory = c,
                                    version = 0;

                                c = signal(null);

                                effect(() => {
                                    let id = version++;

                                    (read(factory) as any as () => Promise<T[typeof key]>)().then((value) => {
                                        if (id !== version) {
                                            return;
                                        }

                                        set(c!, value);
                                    });
                                });
                            }
                        }

                        return read(c);
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
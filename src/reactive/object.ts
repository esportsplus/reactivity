import { defineProperty, isArray, isFunction, isObject, isPromise, Prettify } from '@esportsplus/utilities';
import { computed, dispose, effect, read, root, set, signal } from '~/system';
import { Computed, Infer, Signal } from '~/types';
import { REACTIVE_OBJECT } from '~/constants';
import array from './array';


type API<T extends Record<PropertyKey, unknown>> = Prettify<{ [K in keyof T]: Infer<T[K]> }> & ReactiveObject<T>;


class ReactiveObject<T extends Record<PropertyKey, unknown>> {
    [REACTIVE_OBJECT] = true;


    private disposers: VoidFunction[] | null = null;


    constructor(data: T) {
        let keys = Object.keys(data);

        for (let i = 0, n = keys.length; i < n; i++) {
            let key = keys[i],
                value = data[key];

            if (isArray(value)) {
                let node = array(value);

                (this.disposers ??= []).push( () => node.dispose() );

                defineProperty(this, key, {
                    enumerable: true,
                    value: node
                });
            }
            else if (isFunction(value)) {
                let node: Computed<T[typeof key]> | Signal<T[typeof key] | undefined> | undefined;

                defineProperty(this, key, {
                    enumerable: true,
                    get: () => {
                        if (node === undefined) {
                            root(() => {
                                node = computed(value as Computed<T[typeof key]>['fn']);

                                if (isPromise(node.value)) {
                                    let factory = node,
                                        version = 0;

                                    node = signal<T[typeof key] | undefined>(undefined);

                                    (this.disposers ??= []).push(
                                        effect(() => {
                                            let id = ++version;

                                            (read(factory) as Promise<T[typeof key]>).then((v) => {
                                                if (id !== version) {
                                                    return;
                                                }

                                                set(node as Signal<typeof v>, v);
                                            });
                                        })
                                    )
                                }
                                else {
                                    (this.disposers ??= []).push(() => dispose(node as Computed<T[typeof key]>));
                                }
                            });
                        }

                        return read(node!);
                    }
                });
            }
            else {
                let node = signal(value);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        return read(node);
                    },
                    set(v: typeof value) {
                        set(node, v);
                    }
                });
            }
        }
    }


    dispose() {
        let disposers = this.disposers;

        if (disposers) {
            for (let i = 0, n = disposers.length; i < n; i++) {
                disposers[i]();
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
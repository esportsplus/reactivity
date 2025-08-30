import { defineProperty, isArray, isObject, isPromise } from '@esportsplus/utilities';
import { computed, dispose, effect, read, root, set, signal } from '~/system';
import { Computed, Signal } from '~/types';
import { REACTIVE_OBJECT } from '~/constants';
import { ReactiveArray } from './array';


class ReactiveObject<T extends Record<PropertyKey, unknown>> {
    [REACTIVE_OBJECT] = true;


    private disposers: VoidFunction[] | null = null;


    constructor(data: T) {
        let keys = Object.keys(data);

        for (let i = 0, n = keys.length; i < n; i++) {
            let key = keys[i],
                value = data[key];

            let type = typeof value;

            if (type === 'function') {
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

                continue;
            }

            if (value == null || type !== 'object') {
                // Avoid isArray when possible
            }
            else if (isArray(value)) {
                let node = new ReactiveArray(value);

                (this.disposers ??= []).push( () => node.dispose() );

                defineProperty(this, key, {
                    enumerable: true,
                    value: node
                });

                continue;
            }

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


    dispose() {
        let disposers = this.disposers,
            disposer;

        if (!disposers) {
            return;
        }

        while (disposer = disposers.pop()) {
            disposer();
        }
    }
}


const isReactiveObject = (value: any): value is ReactiveObject<any> => {
    return isObject(value) && REACTIVE_OBJECT in value;
};


export { isReactiveObject, ReactiveObject };
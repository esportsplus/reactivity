import { defineProperty, isArray, isPromise } from '@esportsplus/utilities';
import { computed, dispose, effect, read, root, signal, write } from '~/system';
import { Computed, Signal } from '~/types';
import { REACTIVE_OBJECT } from '~/constants';
import { ReactiveArray } from './array';


class ReactiveObject<T extends Record<PropertyKey, unknown>> {
    private disposers: VoidFunction[] | null = null;


    constructor(data: T) {
        for (let key in data) {
            let value = data[key as keyof T],
                type = typeof value;

            if (type === 'function') {
                let node: Computed<T[keyof T]> | Signal<T[keyof T] | undefined> | undefined;

                defineProperty(this, key, {
                    enumerable: true,
                    get: () => {
                        if (node === undefined) {
                            root(() => {
                                node = computed(value as Computed<T[keyof T]>['fn']);

                                if (isPromise(node.value)) {
                                    let factory = node,
                                        version = 0;

                                    node = signal<T[keyof T] | undefined>(undefined);

                                    (this.disposers ??= []).push(
                                        effect(() => {
                                            let id = ++version;

                                            (read(factory) as Promise<T[keyof T]>).then((v) => {
                                                if (id !== version) {
                                                    return;
                                                }

                                                write(node as Signal<typeof v>, v);
                                            });
                                        })
                                    )
                                }
                                else {
                                    (this.disposers ??= []).push(() => dispose(node as Computed<T[keyof T]>));
                                }
                            });
                        }

                        return read(node!);
                    }
                });

                continue;
            }

            if (value == null || type !== 'object') {
                // Skip isArray when possible
            }
            else if (isArray(value)) {
                let node = new ReactiveArray(...value);

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
                    write(node, v);
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

Object.defineProperty(ReactiveObject.prototype, REACTIVE_OBJECT, { value: true });


const isReactiveObject = (value: any): value is ReactiveObject<any> => {
    return typeof value === 'object' && value !== null && value[REACTIVE_OBJECT] === true;
};


export { isReactiveObject, ReactiveObject };
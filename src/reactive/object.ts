import { defineProperty, isArray, isPromise } from '@esportsplus/utilities';
import { computed, dispose, effect, read, root, signal, write } from '~/system';
import { Computed, Signal } from '~/types';
import { COMPUTED, REACTIVE_ARRAY, REACTIVE_OBJECT, SIGNAL } from '~/constants';
import { ReactiveArray } from './array';


class ReactiveObject<T extends Record<PropertyKey, unknown>> {
    protected disposers: VoidFunction[] | null = null;


    constructor(data: T | null) {
        if (data == null) {
            return;
        }

        let keys = Object.keys(data);

        for (let i = 0, n = keys.length; i < n; i++) {
            let key = keys[i],
                value = data[key as keyof T],
                type = typeof value;

            if (type === 'function') {
                let node = this[COMPUTED]( value as () => T[keyof T] );

                defineProperty(this, key, {
                    enumerable: true,
                    get: () => read(node)
                });

                continue;
            }

            if (value == null || type !== 'object') {
                // Skip isArray when possible
            }
            else if (isArray(value)) {
                defineProperty(this, key, {
                    enumerable: true,
                    value: this[REACTIVE_ARRAY](value)
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


    protected [REACTIVE_ARRAY]<U>(value: U[]): ReactiveArray<U> {
        let node = new ReactiveArray(...value);

        (this.disposers ??= []).push( () => node.dispose() );

        return node;
    }

    protected [COMPUTED]<T extends Computed<ReturnType<T>>['fn']>(value: T) {
        return root(() => {
            let node: Computed<ReturnType<T>> | Signal<ReturnType<T> | undefined> = computed(value);

            if (isPromise(node.value)) {
                let factory = node as Computed<ReturnType<T>>,
                    out = signal<ReturnType<T> | undefined>(undefined),
                    v = 0;

                (this.disposers ??= []).push(
                    effect(() => {
                        let id = ++v;

                        (read(factory) as Promise<ReturnType<T>>).then((resolved) => {
                            if (id !== v) {
                                return;
                            }

                            write(out as Signal<typeof resolved>, resolved);
                        });
                    })
                );

                return out;
            }

            (this.disposers ??= []).push(() => dispose(node as Computed<ReturnType<T>>));

            return node;
        });
    }

    protected [SIGNAL]<T>(value: T) {
        return signal(value);
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
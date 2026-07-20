import { defineProperty, isArray } from '@esportsplus/utilities';
import { COMPUTED, REACTIVE_ARRAY, REACTIVE_OBJECT, SIGNAL } from '~/constants';
import { computed, dispose, read, root, signal, write } from '~/system';
import { Computed } from '~/types';
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

            if (value != null && type === 'object' && isArray(value)) {
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


    protected [COMPUTED]<T extends Computed<ReturnType<T>>['fn']>(value: T) {
        return root(() => {
            let node = computed(value);

            (this.disposers ??= []).push(() => dispose(node));

            return node;
        });
    }

    protected [REACTIVE_ARRAY]<U>(value: U[]): ReactiveArray<U> {
        let node = new ReactiveArray(...value);

        (this.disposers ??= []).push( () => node.dispose() );

        return node;
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


const isReactiveObject = (value: unknown): value is ReactiveObject<Record<PropertyKey, unknown>> => {
    return typeof value === 'object' && value !== null && (value as Record<PropertyKey, unknown>)[REACTIVE_OBJECT] === true;
};


export { isReactiveObject, ReactiveObject };

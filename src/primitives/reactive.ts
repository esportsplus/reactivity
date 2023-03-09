import { computed, read, signal, write } from '~/core';
import { Computed, Infer, Options, Signal } from '~/types';


export default <T>(value: Record<PropertyKey, Computed<T>['fn'] | Signal<T>['value']>, options: Options = {}) => {
    let instance = {};

    for (let key in value) {
        if (typeof value[key] === 'function') {
            let node = computed(value[key] as Computed<T>['fn'], options);

            Object.defineProperty(instance, key, {
                get() {
                    return read(node);
                }
            });
        }
        else {
            let node = signal(value[key], options);

            Object.defineProperty(instance, key, {
                get() {
                    return read(node);
                },
                set(value) {
                    write(node, value);
                }
            });
        }
    }

    return instance as Infer<typeof value>;
};
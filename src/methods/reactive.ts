import { Infer } from '~/types';
import Reactive from '~/reactive';


function factory<T>(value: T, wrap = false) {
    if (typeof value === 'function') {
        return fn(value, wrap);
    }

    if (typeof value === 'object' && value !== null && (value.constructor === Object)) {
        return obj(value);
    }

    return new Reactive(value) as T;
}

function fn<T>(value: T, wrap: boolean) {
    let fn = new Reactive(value);

    // We're inside an object, it will unwrap reactive values
    if (!wrap) {
        return fn;
    }

    // Factory functions are wrapped to remove '.get' usage
    return (...args: any[]) => {
        let value = fn.get();

        if (args.length && typeof value === 'function') {
            value = value(...args);
        }

        return value as typeof value extends (...args: any[]) => any
            ? ReturnType<typeof value>
            : typeof value;
    };
}

// TODO: Typecheck on `values` to get rid of lazy var?
function obj<T>(values: T) {
    let lazy: Record<string, any> = {},
        properties: PropertyDescriptorMap = {};

    for (let key in values) {
        properties[key] = {
            get() {
                if (!lazy[key]) {
                    lazy[key] = factory(values[key]);
                }

                if (lazy[key] instanceof Reactive) {
                    return lazy[key].get();
                }

                return lazy[key];
            },
            set(value: unknown) {
                if (!lazy[key]) {
                    lazy[key] = factory(values[key]);
                }

                if (lazy[key] instanceof Reactive) {
                    lazy[key].set(value);
                }
                else {
                    lazy[key] = factory(value);
                }
            }
        };
    }

    return Object.defineProperties({}, properties) as T;
};


export default <T>(value: T) => factory(value, true) as Infer<T>;
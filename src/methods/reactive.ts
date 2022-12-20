import { Infer } from '~/types';
import Reactive from '~/reactive';


function factory<T>(value: T) {
    if (typeof value === 'object' && value !== null && (value.constructor === Object)) {
        return obj(value);
    }

    return new Reactive(value);
}

// Functions are wrapped to remove '.get' usage
function fn<T>(value: T) {
    let fn = new Reactive(value);

    return (...args: any[]) => {
        let value = fn.get();

        if (args.length && typeof value === 'function') {
            value = value(...args);
        }

        return value;
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

    return Object.defineProperties({}, properties);
};


export default <T>(value: T) => {
    if (typeof value === 'function') {
        return fn(value) as Infer<T>;
    }

    return factory(value) as Infer<T>;
};
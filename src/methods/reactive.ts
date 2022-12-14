import { Infer } from '~/types';
import Reactive from '~/reactive';


// TODO: Typecheck on `values` to get rid of lazy var
function obj<T>(values: T) {
    let lazy: Record<string, any> = {},
        properties: PropertyDescriptorMap = {};

    for (let key in values) {
        properties[key] = {
            get() {
                if (!lazy[key]) {
                    lazy[key] = setup(values[key]);
                }

                return lazy[key].get();
            },
            set(value: unknown) {
                if (!lazy[key]) {
                    lazy[key] = setup(values[key]);
                }

                lazy[key].set(value);
            }
        };
    }

    return Object.defineProperties({}, properties) as T;
};

function setup<T>(value: T) {
    // if (Array.isArray(value)) {
    // TODO
    // }
    // TODO: Can remove isArray implementation is created
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return obj(value);
    }

    return reactive(value) as T;
}


const reactive = <T>(value: T) => {
    let v: unknown;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        v = obj(value);
    }
    else {
        v = new Reactive(value);
    }

    return v as Infer<T>;
};


export default reactive;
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
                    lazy[key] = reactive(values[key]);
                }

                return lazy[key].get();
            },
            set(value: unknown) {
                if (!lazy[key]) {
                    lazy[key] = reactive(values[key]);
                }

                lazy[key].set(value);
            }
        };
    }

    return Object.defineProperties({}, properties) as T;
};

function reactive<T>(value: T) {
    // if (Array.isArray(value)) {
    // TODO
    // }
    // TODO: Can remove isArray implementation is created
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return obj(value);
    }

    return new Reactive(value) as T;
}


export default <T>(value: T) => reactive(value) as Infer<T>;
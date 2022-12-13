import { reactive } from './index';


function setup(value: unknown) {
    // if (Array.isArray(value)) {
    // TODO: Need a solution
    // }
    // TODO: Can remove isArray once solution is found ^
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return factory(value);
    }

    return reactive(value);
}


// TODO: Typecheck on values tro get rid of lazy var
const factory = <T extends Record<string, any>>(values: T) => {
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

    return Object.defineProperties({}, properties);
};


export default factory;
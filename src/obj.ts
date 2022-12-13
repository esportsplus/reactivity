import { reactive } from './index';


const factory = (values: Record<string, unknown>) => {
    let lazy: Record<string, any> = {},
        properties: PropertyDescriptorMap = {};

    for (let key in values) {
        properties[key] = {
            get() {
                if (!lazy[key]) {
                    let value = values[key];

                    // if (Array.isArray(value)) {
                    // TODO: Need a solution
                    // }
                    // TODO: Can remove isArray once solution is found ^
                    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                        lazy[key] = factory(value as Record<string, unknown>);
                    }
                    else {
                        lazy[key] = reactive(value);
                    }
                }

                return lazy[key]?.get() || lazy[key];
            },
            set(value: unknown) {
                lazy[key].set(value);
            }
        };
    }

    return Object.defineProperties({}, properties);
};


export default factory;
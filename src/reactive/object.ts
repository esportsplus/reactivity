import { computed, read, signal, write } from '~/signal';
import { Computed, Object, Options, Signal } from '~/types';
import { defineProperty, isArray } from '~/utilities';
import { ReactiveArray, ReactiveObjectArray } from './array';


class ReactiveObject<T extends Object> {
    nodes: Record<PropertyKey, Computed<unknown> | ReactiveObjectArray<Object> | ReactiveArray<unknown> | Signal<unknown>> = {};


    constructor(data: T, options: Options = {}) {
        let nodes = this.nodes;

        for (let key in data) {
            let input = data[key];

            if (typeof input === 'function') {
                let node = nodes[key] = computed(input as Computed<unknown>['fn'], options);

                defineProperty(this, key, {
                    get() {
                        return read(node);
                    }
                });
            }
            else if (isArray(input)) {
                let node: ReactiveArray<unknown> | ReactiveObjectArray<Object>,
                    test = input[0];

                if (typeof test === 'object' && test !== null && test.constructor.name === 'Object') {
                    node = nodes[key] = new ReactiveObjectArray(input, options);
                }
                else {
                    node = nodes[key] = new ReactiveArray(input);
                }

                defineProperty(this, key, {
                    get() {
                        node.track();

                        return node;
                    }
                });
            }
            else {
                let node = nodes[key] = signal(input, options);

                defineProperty(this, key, {
                    get() {
                        return read(node);
                    },
                    set(value) {
                        write(node, value);
                    }
                });
            }
        }
    }


    dispose() {
        let nodes = this.nodes;

        for (let key in nodes) {
            nodes[key].dispose();
        }
    }

    reset() {
        let nodes = this.nodes;

        for (let key in nodes) {
            nodes[key].reset();
        }
    }
}


export { ReactiveObject };
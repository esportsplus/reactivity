import { Computed, Object, Options, Signal } from '~/types';
import { defineProperty, isArray } from '~/utilities';
import { ReactiveArray, ReactiveObjectArray } from './array';


type Node = Computed<unknown> | ReactiveArray<unknown> | ReactiveObjectArray<Object> | Signal<unknown>;


class ReactiveObject<T extends Object> {
    nodes: Record<PropertyKey, Node> = {};


    constructor(data: T, options: Options = {}) {
        let nodes = this.nodes;

        for (let key in data) {
            let input = data[key];

            if (typeof input === 'function') {
                let node = nodes[key] = new Computed(input as Computed<T>['fn'], options);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        return node.get();
                    }
                });
            }
            else if (isArray(input)) {
                let node: ReactiveArray<unknown> | ReactiveObjectArray<Object>,
                    test = input[0];

                if (typeof test === 'object' && test !== null && test?.constructor?.name === 'Object') {
                    node = nodes[key] = new ReactiveObjectArray(input, options);
                }
                else {
                    node = nodes[key] = new ReactiveArray(input);
                }

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        node.track();

                        return node;
                    }
                });
            }
            else {
                let node = nodes[key] = new Signal(input, options);

                defineProperty(this, key, {
                    enumerable: true,
                    get() {
                        return node.get();
                    },
                    set(value) {
                        node.set(value);
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
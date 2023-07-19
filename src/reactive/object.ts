import { computed, read, signal, write } from '~/signal';
import { Computed, Options, Signal } from '~/types';
import { defineProperty, isArray } from '~/utilities';
import { ReactiveArray, ReactiveObjectArray } from './array';


type Node<T> =
    T extends (...args: unknown[]) => unknown
        ? Computed<T>
        : T extends unknown[]
            ? T extends Object[] ? ReactiveObjectArray<T[0]> : ReactiveArray<T>
            : Signal<T>;

type Nodes<T extends Object> = { [K in keyof T]: Node<T[K]> };

type Object = Record<PropertyKey, unknown>;


class ReactiveObject<T extends Object> {
    nodes: Nodes<T>;


    constructor(data: T, options: Options = {}) {
        let nodes: Object = {};

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

        this.nodes = nodes as typeof this.nodes;
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
import CustomFunction from '@esportsplus/custom-function';
import { computed, read } from './signal';
import { Computed } from './types';


type Fn<A extends unknown[], R> = Computed<(...args: A) => R>['fn'];

type Options = Parameters<typeof computed>[1];


class Macro<A extends unknown[], R> extends CustomFunction {
    #factory: Computed< ReturnType<Fn<A,R>> >;


    constructor(fn: Fn<A,R>, options: Options = {}) {
        super((...args: A) => {
            return read(this.#factory)(...args);
        });
        this.#factory = computed(fn, options);
    }


    dispose() {
        this.#factory.dispose();
    }

    reset() {
        this.#factory.reset();
    }
}


export default <A extends unknown[], R>(fn: Fn<A,R>, options: Options = {}) => {
    return new Macro(fn, options);
};
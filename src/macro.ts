import CustomFunction from '@esportsplus/custom-function';
import { computed, read } from './signal';
import { Computed, Options } from './types';


type Function<A extends unknown[], R> = Computed<(...args: A) => R>['fn'];


class Macro<A extends unknown[], R> extends CustomFunction {
    #factory: Computed<(...args: A) => R>;


    constructor(fn: Function<A,R>, options: Options = {}) {
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


export default <A extends unknown[], R>(fn: Function<A,R>, options: Options = {}) => {
    return new Macro(fn, options);
};
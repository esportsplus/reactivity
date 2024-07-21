import CustomFunction from '@esportsplus/custom-function';
import { computed } from './signal';
import { Computed, Options } from './types';


class Macro<A extends unknown[], R> extends CustomFunction {
    private factory: Computed<(...args: A) => R>;


    constructor(fn: Macro<A,R>['factory']['fn'], options: Options = {}) {
        super((...args: A) => {
            return this.factory.get()(...args);
        });
        this.factory = computed(fn, options);
    }


    dispose() {
        this.factory.dispose();
    }
}


export default <A extends unknown[], R>(fn: Macro<A,R>['factory']['fn'], options: Options = {}) => {
    return new Macro(fn, options);
};
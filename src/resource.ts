import CustomFunction from '@esportsplus/custom-function';
import { Signal } from './signal';
import { Options } from './types';


type Function<A extends unknown[], R extends Promise<unknown>> = (...args: A) => R;


class Resource<A extends unknown[], R extends Promise<unknown>> extends CustomFunction {
    #data: Signal<Awaited<R>>;
    #input: Signal<A | null>;
    #ok: Signal<boolean | null>;

    stop: boolean | null = null;


    constructor(fn: Function<A,R>, options: Options = {}) {
        super((...args: A) => {
            this.stop = null;

            this.#input.set(args);
            this.#ok.set(null);

            fn(...args)
                .then((value) => {
                    if (this.stop === true) {
                        return;
                    }

                    this.#data.set(value as Awaited<R>);
                    this.#ok.set(true);
                })
                .catch(() => {
                    if (this.stop === true) {
                        return;
                    }

                    this.#data.set(undefined as Awaited<R>);
                    this.#ok.set(false);
                });
        });
        this.#data = new Signal(undefined as Awaited<R>, options);
        this.#input = new Signal<A | null>(null, options);
        this.#ok = new Signal<boolean | null>(null, options);
    }


    get data() {
        return this.#data.get();
    }

    get input() {
        return this.#input.get();
    }

    get ok() {
        return this.#ok.get();
    }


    dispose() {
        this.#data.dispose();
        this.#input.dispose();
        this.#ok.dispose();
    }

    reset() {
        this.#data.reset();
        this.#input.reset();
        this.#ok.reset();
    }
}


export default <A extends unknown[], R extends Promise<unknown>>(fn: Function<A,R>, options: Options = {}) => {
    return new Resource(fn, options);
};
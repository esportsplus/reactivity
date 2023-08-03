import CustomFunction from '@esportsplus/custom-function';
import { signal } from './signal';
import { Options, Signal } from './types';


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
        this.#data = signal(undefined as Awaited<R>, options);
        this.#input = signal<A | null>(null, options);
        this.#ok = signal<boolean | null>(null, options);
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
}


export default <A extends unknown[], R extends Promise<unknown>>(fn: Function<A,R>, options: Options = {}) => {
    return new Resource(fn, options);
};
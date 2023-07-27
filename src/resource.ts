import CustomFunction from '@esportsplus/custom-function';
import { computed, read, signal, write } from './signal';
import { Signal } from './types';


type Fn<A extends unknown[], R extends Promise<unknown>> = (...args: A) => R;

type Options = Parameters<typeof computed>[1];


class Resource<A extends unknown[], R extends Promise<unknown>> extends CustomFunction {
    #data: Signal<Awaited<R>>;
    #input: Signal<A | null>;
    #ok: Signal<boolean | null>;

    stop: boolean | null = null;


    constructor(fn: Fn<A,R>, options: Options = {}) {
        super((...args: A) => {
            this.stop = null;

            write(this.#input, args);
            write(this.#ok, null);

            fn(...args)
                .then((value) => {
                    if (this.stop === true) {
                        return;
                    }

                    write(this.#data, value);
                    write(this.#ok, true);
                })
                .catch(() => {
                    if (this.stop === true) {
                        return;
                    }

                    write(this.#data, undefined);
                    write(this.#ok, false);
                });
        });
        this.#data = signal(options.value as Awaited<R>, options),
        this.#input = signal<A | null>(null, options),
        this.#ok = signal<boolean | null>(null, options)
    }


    get data() {
        return read(this.#data);
    }

    get ok() {
        return read(this.#ok);
    }

    get input() {
        return read(this.#input);
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


export default <A extends unknown[], R extends Promise<unknown>>(fn: Fn<A,R>, options: Options = {}) => {
    return new Resource(fn, options);
};
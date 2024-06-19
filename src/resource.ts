import CustomFunction from '@esportsplus/custom-function';
import { signal } from './signal';
import { Options, Signal } from './types';


type Function<A extends unknown[], R extends Promise<unknown>> = (...args: A) => R;


class Resource<A extends unknown[], R extends Promise<unknown>> extends CustomFunction {
    private arguments: Signal<A | null>;
    private okay: Signal<boolean | null>;
    private response: Signal<Awaited<R>>;

    stop: boolean | null = null;


    constructor(fn: Function<A,R>, options: Options = {}) {
        super((...args: A) => {
            this.stop = null;

            this.arguments.set(args);
            this.okay.set(null);

            fn(...args)
                .then((value) => {
                    if (this.stop === true) {
                        return;
                    }

                    this.response.set(value as Awaited<R>);
                    this.okay.set(true);
                })
                .catch(() => {
                    if (this.stop === true) {
                        return;
                    }

                    this.response.set(undefined as Awaited<R>);
                    this.okay.set(false);
                });
        });
        this.response = signal(undefined as Awaited<R>, options);
        this.arguments = signal<A | null>(null, options);
        this.okay = signal<boolean | null>(null, options);
    }


    get data() {
        return this.response.get();
    }

    get input() {
        return this.arguments.get();
    }

    get ok() {
        return this.okay.get();
    }


    dispose() {
        this.arguments.dispose();
        this.okay.dispose();
        this.response.dispose();
    }
}


export default <A extends unknown[], R extends Promise<unknown>>(fn: Function<A,R>, options: Options = {}) => {
    return new Resource(fn, options);
};
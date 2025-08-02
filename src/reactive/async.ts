import CustomFunction from '@esportsplus/custom-function';
import { read, root, signal } from '~/system';
import { Signal } from '~/types';


let { set } = signal;


class ReactiveAsyncFunction<A extends unknown[], R extends Promise<unknown>> extends CustomFunction {
    private arguments: Signal<A | null>;
    private okay: Signal<boolean | null>;
    private response: Signal<Awaited<R> | null>;

    stop: boolean | null = null;


    constructor(fn: (...args: A) => R) {
        super((...args: A) => {
            this.stop = null;

            set(this.arguments, args);
            set(this.okay, null);

            return root(() => {
                return fn(...args)
                    .then((value) => {
                        if (this.stop === true) {
                            return;
                        }

                        set(this.response, value as Awaited<R>);
                        set(this.okay, true);
                    })
                    .catch(() => {
                        if (this.stop === true) {
                            return;
                        }

                        set(this.response, null);
                        set(this.okay, false);
                    });
            });
        });

        this.response = signal(null);
        this.arguments = signal(null);
        this.okay = signal(null);
    }


    get data() {
        return read(this.response);
    }

    get input() {
        return read(this.arguments);
    }

    get ok() {
        return read(this.okay);
    }
}


export default <A extends unknown[], R extends Promise<unknown>>(fn: (...args: A) => R) => {
    return new ReactiveAsyncFunction(fn);
};
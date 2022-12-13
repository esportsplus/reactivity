import { CLEAN, CHECK, DIRTY } from './symbols';
import { State } from './types';
import obj from './obj';


let index = 0,
    queue: Reactive<any>[] = [],
    reaction: Reactive<any> | null = null,
    running: boolean = false,
    stack: Reactive<any>[] | null = null;


class Reactive<T> {
    private effect: boolean;
    private fn?: (onCleanup: (fn: VoidFunction) => void) => T;
    private observers: Reactive<any>[] | null = null;
    private sources: Reactive<any>[] | null = null;
    private state: State;
    private value: T;


    cleanup: ((old: T) => void)[] | null = null;


    constructor(_: ((fn: VoidFunction) => T) | T, effect: boolean = false) {
        this.effect = effect;

        if (typeof _ === 'function') {
            this.fn = _ as (onCleanup: (fn: VoidFunction) => void) => T;
            this.state = DIRTY;
            this.value = undefined as any;

            if (effect) {
                this.update();
            }
        }
        else {
            this.state = CLEAN;
            this.value = _;
        }
    }


    get(): T {
        if (reaction) {
            if (!stack && reaction.sources && reaction.sources[index] == this) {
                index++;
            }
            else {
                if (!stack) {
                    stack = [this];
                }
                else {
                    stack.push(this);
                }
            }
        }

        if (this.fn) {
            this.sync();
        }

        return this.value;
    }

    set(value: T): void {
        if (this.observers && this.value !== value) {
            for (let i = 0; i < this.observers.length; i++) {
                this.observers[i].mark(DIRTY);
            }
        }

        this.value = value;
    }


    private mark(state: typeof CHECK | typeof DIRTY): void {
        if (this.state < state) {
            // If previous state was clean we need to update effects
            if (this.state === CLEAN && this.effect) {
                queue.push(this);
            }

            this.state = state;

            if (!this.observers) {
                return;
            }

            for (let i = 0; i < this.observers.length; i++) {
                this.observers[i].mark(CHECK);
            }
        }
    }

    // We don't actually delete sources here because we're replacing the entire array soon
    private removeParentObservers(): void {
        if (!this.sources) {
            return;
        }

        for (let i = index; i < this.sources.length; i++) {
            let source = this.sources[i];

            source.observers![ source.observers!.findIndex((v) => v === this) ] = source.observers![source.observers!.length - 1];
            source.observers!.pop();
        }
    }

    // Update if dirty or if a parent is dirty
    private sync(): void {
        // If we are potentially dirty, see if we have a parent who has actually changed value
        if (this.state === CHECK && this.sources) {
            for (let i = 0, n = this.sources.length; i < n; i++) {
                this.sources[i].sync();

                // Stop the loop here so we won't trigger updates on other parents unnecessarily
                // If our computation changes to no longer use some sources, we don't
                // want to update() a source we used last time, but now don't use.
                if ((this.state as State) === DIRTY) {
                    break;
                }
            }
        }

        // If we were already dirty or marked dirty by the step above, update.
        if (this.state === DIRTY) {
            this.update();
        }

        // By now, we're clean
        this.state = CLEAN;
    }

    private update(): void {
        let previous = {
                index: index,
                reaction: reaction,
                stack: stack,
                value: this.value
            };

        index = 0;
        reaction = this;
        stack = [];

        try {
            if (this.cleanup) {
                for (let i = 0, n = this.cleanup.length; i < n; i++) {
                    this.cleanup[i]( this.value );
                }

                this.cleanup.length = 0;
            }

            this.value = this.fn!(
                (fn: VoidFunction) => {
                    if (!this.cleanup) {
                        this.cleanup = [fn];
                    }
                    else {
                        this.cleanup.push(fn);
                    }
                }
            );

            // If sources have changed, update source & observer links
            if (stack.length) {
                // Remove all old sources' observers links to us
                this.removeParentObservers();

                // Update source up links
                if (this.sources && index > 0) {
                    this.sources.length = index + stack.length;

                    for (let i = 0; i < stack.length; i++) {
                        this.sources[index + i] = stack[i];
                    }
                }
                else {
                    this.sources = stack;
                }

                // Add ourselves to the end of the parent observers array
                for (let i = index; i < this.sources.length; i++) {
                    let source = this.sources[i];

                    if (!source.observers) {
                        source.observers = [this];
                    }
                    else {
                        source.observers.push( this );
                    }
                }
            }
            // Remove all old sources' observers links to us
            else if (this.sources && index < this.sources.length) {
                this.removeParentObservers();
                this.sources.length = index;
            }
        }
        finally {
            index = previous.index;
            reaction = previous.reaction;
            stack = previous.stack;
        }

        // Handle diamond depenendencies if we're the parent of a diamond.
        if (this.observers && previous.value !== this.value) {
            for (let i = 0; i < this.observers.length; i++) {
                this.observers[i].state = DIRTY;
            }
        }

        this.state = CLEAN;
    }
}



const effect = <T>(value: () => T) => {
    new Reactive(value, true);
};

const reactive = <T>(value: T): T => {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return obj(value);
    }

    return new Reactive(value) as T;
};

const tick = () => {
    if (running) {
        return;
    }

    running = true;

    for (let i = 0, n = queue.length; i < n; i++) {
        queue[i].get();
    }

    queue.length = 0;
    running = false;
};


export { effect, reactive, tick };



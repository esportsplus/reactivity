import { CLEAN, CHECK, DIRTY } from './symbols';
import { ReactiveFn, Scheduler, State } from './types';


let index = 0,
    reaction: Reactive<any> | null = null,
    queue: Reactive<any>[] = [],
    scheduled = false,
    schedulers = new Set<Scheduler>,
    stack: Reactive<any>[] | null = null;


function mark(instances: Reactive<any>[] | null, state: typeof CHECK | typeof DIRTY) {
    if (!instances) {
        return;
    }

    for (let i = 0, n = instances.length; i < n; i++) {
        let instance = instances[i];

        if (instance.state < state) {
            // If previous state was clean we need to update effects
            if (instance.effect && instance.state === CLEAN) {
                queue.push(instance);

                if (!scheduled) {
                    for (let scheduler of schedulers) {
                        scheduler.schedule();
                    }

                    scheduled = true;
                }
            }

            instance.state = state;

            if (instance.observers) {
                mark(instance.observers, CHECK);
            }
        }
    }
}

async function task() {
    for (let i = 0, n = queue.length; i < n; i++) {
        await queue[i].get();
    }

    queue.length = 0;
    scheduled = false;
}


class Reactive<T> {
    private fn?: ReactiveFn<T>;
    private value: T;


    effect: boolean;
    cleanup: ((old: T) => void)[] | null = null;
    observers: Reactive<any>[] | null = null;
    sources: Reactive<any>[] | null = null;
    state: State;


    constructor(data: ReactiveFn<T> | T, effect: boolean = false) {
        this.effect = effect;

        if (typeof data === 'function') {
            this.fn = data as ReactiveFn<T>;
            this.state = DIRTY;
            this.value = undefined as any;

            if (effect) {
                this.update();
            }
        }
        else {
            this.state = CLEAN;
            this.value = data;
        }
    }


    get() {
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

        return this.value as T extends (...args: any[]) => any ? ReturnType<T> : T;
    }

    set(value: T) {
        if (this.value !== value) {
            mark(this.observers, DIRTY);
        }

        this.value = value;
    }

    // We don't actually delete sources here because we're replacing the entire array soon
    private removeParentObservers() {
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
    private sync() {
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

    private update() {
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


const scheduler = {
    add: (scheduler: Scheduler) => {
        scheduler.tasks.add(task);
        schedulers.add(scheduler);
    },
    delete: (scheduler: Scheduler) => {
        scheduler.tasks.delete(task);
        schedulers.delete(scheduler);
    }
};


export default Reactive;
export { scheduler };
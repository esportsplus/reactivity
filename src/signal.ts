import { Changed, Context, Listener, Options, Root, Scheduler, State, Type } from '~/types';


class Signal<T> {
    changed: Changed | null = null;
    context: Context<T> | null = null;
    fn: ((previous: T) => Promise<T> | T) | null = null;
    listeners: Record<symbol, (Listener | null)[]> | null = null;
    observers: Signal<T>[] | null = null;
    root: Root | null = null;
    sources: Signal<T>[] | null = null;
    state: State;
    task: Parameters<Scheduler>[0] | null = null;
    type: Type;
    updating: boolean | null = null;
    value: T;


    constructor(data: T, state: Signal<T>['state'], type: Signal<T>['type'], options: Options = {}) {
        if (options?.changed) {
            this.changed = options.changed;
        }

        this.state = state;
        this.type = type;
        this.value = data;
    }
}


export default Signal;
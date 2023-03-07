import { Changed, Fn, Listener, Options, Root, Scheduler, State, Type, Wrapper } from './types';


class Signal<T = unknown> {
    changed: Changed | null = null;
    context: any & Wrapper | null = null;
    fn: Fn<T> | null = null;
    listeners: Record<symbol, Listener[]> | null = null;
    observers: Signal[] | null = null;
    root: Root | null = null;
    sources: Signal[] | null = null;
    task: Parameters<Scheduler>[0] | null = null;
    type: Type;
    state: State;
    value: T;


    constructor(data: T, state: Signal['state'], type: Signal['type'], options: Options = {}) {
        if (options?.changed) {
            this.changed = options.changed;
        }

        this.state = state;
        this.type = type;
        this.value = data;
    }
}


export default Signal;
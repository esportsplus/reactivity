import { NODE } from '~/symbols';
import { Context, Event, Listener, Prettify, Signal } from '~/types';


type Internals = {
    [NODE]: Signal<any>;
};


function dispose(this: Internals) {
    this[NODE].dispose();
}

function on(this: Internals, event: Event, listener: Listener) {
    this[NODE].on(event,listener);
}

function once(this: Internals, event: Event, listener: Listener) {
    this[NODE].once(event, listener);
}

function reset(this: Internals) {
    this[NODE].reset();
}


export default <T>(host: T & Partial<Context>, node: Internals[typeof NODE]) => {
    (host as unknown as Internals)[NODE] = node;

    host.dispose = dispose;
    host.on = on;
    host.once = once;
    host.reset = reset;

    return host as Prettify< Required<typeof host> >;
};
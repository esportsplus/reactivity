import { NODES } from '~/symbols';
import { Context, Event, Listener, Prettify, Signal } from '~/types';


type Internals = {
    [NODES]: Record<PropertyKey, Signal<any>> ;
};


function dispose(this: Internals) {
    let nodes = this[NODES];

    for (let key in nodes) {
        nodes[key].dispose();
    }
}

function on(this: Internals, event: Event, listener: Listener) {
    let nodes = this[NODES];

    for (let key in nodes) {
        nodes[key].on(event, listener);
    }
}

function once(this: Internals, event: Event, listener: Listener) {
    let nodes = this[NODES];

    for (let key in nodes) {
        nodes[key].once(event, listener);
    }
}

function reset(this: Internals) {
    let nodes = this[NODES];

    for (let key in nodes) {
        nodes[key].reset();
    }
}


export default <T>(host: T & Partial<Context>, nodes: Internals[typeof NODES]) => {
    (host as unknown as Internals)[NODES] = nodes;

    host.dispose = dispose;
    host.on = on;
    host.once = once;
    host.reset = reset;

    return host as Prettify< Required<typeof host> >;
};
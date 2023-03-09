import { dispose as d, on as o, once as oe, reset as r } from './core';
import { Context, Event, Listener, Signal } from '~/types';


function dispose<T>(this: Context<T>) {
    d(this.node);
}

function on<T>(this: Context<T>, event: Event, listener: Listener) {
    o(event, listener, this.node);
}

function once<T>(this: Context<T>, event: Event, listener: Listener) {
    oe(event, listener, this.node);
}

function reset<T>(this: Context<T>) {
    r(this.node);
}


const assign = <T, U>(host: T & Partial<Context<U>>, node: Signal<U>) => {
    host.node = node;

    host.dispose = dispose;
    host.on = on;
    host.once = once;
    host.reset = reset;

    return host as T & Context<U>;
};


export { assign };
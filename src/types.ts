import { Function, NeverAsync, Prettify } from '@esportsplus/typescript'
import { CHECK, CLEAN, COMPUTED, DIRTY, DISPOSED, EFFECT, ROOT, SIGNAL } from './constants';
import { Computed, Effect, Root, Signal } from './signal';


type Changed = (a: unknown, b: unknown) => boolean;

type Event = string;

type Listener<D> = {
    once?: boolean;

    <V>(event: { data?: D, value: V }): void;
};

type Object = Record<PropertyKey, unknown>;

type Options = {
    changed?: Changed;
};

type Scheduler = (fn: Function) => unknown;

type State = typeof CHECK | typeof CLEAN | typeof DIRTY | typeof DISPOSED;

type Type = typeof COMPUTED | typeof EFFECT | typeof ROOT | typeof SIGNAL;


export type { Changed, Computed, Effect, Event, Function, Listener, Object, Options, NeverAsync, Prettify, Root, Scheduler, Signal, State, Type };
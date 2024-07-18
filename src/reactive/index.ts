import { Computed, Object, Options, Prettify, Signal } from '~/types';
import { ReactiveArray, ReactiveObjectArray } from './array';
import { ReactiveObject } from './object';


type Guard<T> =
    T extends Object
        ? { [K in keyof T]: Never<K, Guard<T[K]>> }
        : T extends unknown[]
            ? Guard<T[number]>[]
            : T;

type Infer<T> =
    T extends (...args: unknown[]) => unknown
        ? ReturnType<T>
        : T extends unknown[]
            ? T extends Object[] ? ReactiveObjectArray<T[0]> : ReactiveArray<T[0]>
            : T extends Object
                ? { [K in keyof T]: T[K] }
                : T;

type Never<K,V> = K extends keyof ReactiveObject<Object> ? never : V;

type Nodes<T> =
    T extends (...args: unknown[]) => unknown
        ? Computed<T>
        : T extends unknown[]
            ? T extends Object[] ? ReactiveObjectArray<T[0]> : ReactiveArray<T[0]>
            : Signal<T>;

type Signals<T extends Object> = {
    [K in keyof T]: Nodes<T[K]>
};


export default <T extends Object>(data: Guard<T>, options?: Options) => {
    return new ReactiveObject(data, options) as any as Prettify<
        { [K in keyof T]: Infer<T[K]> } & Omit<ReactiveObject<T>, 'signals'> & { signals: Signals<T> }
    >;
};
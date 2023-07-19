import { Object, Options, Prettify } from '~/types';
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
            ? Infer<T[number]>[]
            : T extends Object
                ? { [K in keyof T]: T[K] }
                : T;

type Never<K,V> = K extends keyof ReactiveObject<Object> ? never : V;


export default <T extends Object>(data: Guard<T>, options: Options = {}) => {
    return new ReactiveObject(data, options) as any as Prettify< { [K in keyof T]: Infer<T[K]> } & ReactiveObject<T> >;
};
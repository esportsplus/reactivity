import { bench, describe } from 'vitest';
import { computed, dispose, effect, read, root, signal, write } from '~/system';
import { ReactiveArray } from '~/reactive/array';
import { ReactiveObject } from '~/reactive/object';


describe('ReactiveObject creation', () => {
    bench('create with 5 signal properties', () => {
        new ReactiveObject({ a: 1, b: 2, c: 3, d: 4, e: 5 });
    });

    bench('create with computed properties', () => {
        new ReactiveObject({
            a: 1,
            b: 2,
            sum: () => 0
        });
    });
});


describe('ReactiveObject read/write', () => {
    bench('read property (signal-backed)', () => {
        let obj = new ReactiveObject({ a: 1, b: 2, c: 3, d: 4, e: 5 });

        (obj as any).a;
    });

    bench('write property (signal-backed)', () => {
        let obj = new ReactiveObject({ a: 1, b: 2, c: 3, d: 4, e: 5 }),
            i = 0;

        (obj as any).a = ++i;
    });
});


describe('ReactiveObject dispose', () => {
    bench('dispose with 5 properties', () => {
        let obj = new ReactiveObject({ a: 1, b: 2, c: 3, d: 4, e: 5 });

        obj.dispose();
    });

    bench('dispose with arrays + computeds', () => {
        let obj = new ReactiveObject({
            items: [1, 2, 3],
            name: 'test',
            total: () => 0
        });

        obj.dispose();
    });
});

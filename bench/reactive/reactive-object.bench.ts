import { test } from 'vitest';
import { ReactiveObject } from '~/reactive/object';


test('ReactiveObject creation', async ({ bench }) => {
    await bench.compare(
        bench('create with 5 signal properties', () => {
            new ReactiveObject({ a: 1, b: 2, c: 3, d: 4, e: 5 });
        }),
        bench('create with computed properties', () => {
            new ReactiveObject({
                a: 1,
                b: 2,
                sum: () => 0
            });
        }),
        bench('create with async computed property', () => {
            new ReactiveObject({
                value: 1,
                async: () => Promise.resolve(0)
            });
        })
    );
});


test('ReactiveObject read/write', async ({ bench }) => {
    await bench.compare(
        bench('read property (signal-backed)', () => {
            let obj = new ReactiveObject({ a: 1, b: 2, c: 3, d: 4, e: 5 });

            (obj as any).a;
        }),
        bench('write property (signal-backed)', () => {
            let obj = new ReactiveObject({ a: 1, b: 2, c: 3, d: 4, e: 5 }),
                i = 0;

            (obj as any).a = ++i;
        })
    );
});


test('ReactiveObject dispose', async ({ bench }) => {
    await bench.compare(
        bench('dispose with 5 properties', () => {
            let obj = new ReactiveObject({ a: 1, b: 2, c: 3, d: 4, e: 5 });

            obj.dispose();
        }),
        bench('dispose with arrays + computeds', () => {
            let obj = new ReactiveObject({
                items: [1, 2, 3],
                name: 'test',
                total: () => 0
            });

            obj.dispose();
        })
    );
});

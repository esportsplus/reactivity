import { test } from 'vitest';
import { ReactiveArray } from '~/reactive/array';
import { effect } from '~/system';


test('ReactiveArray creation', async ({ bench }) => {
    await bench.compare(
        bench('create empty', () => {
            new ReactiveArray<number>();
        }),
        bench('create with 10 items', () => {
            new ReactiveArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        }),
        bench('create with 100 items', () => {
            let items = [];

            for (let i = 0; i < 100; i++) {
                items.push(i);
            }

            new ReactiveArray(items);
        })
    );
});


test('ReactiveArray push', async ({ bench }) => {
    await bench.compare(
        bench('push 1 item', () => {
            let arr = new ReactiveArray<number>();

            arr.push(1);
        }),
        bench('push 10 items (single call)', () => {
            let arr = new ReactiveArray<number>();

            arr.push(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
        }),
        bench('push 10 items (10 calls)', () => {
            let arr = new ReactiveArray<number>();

            for (let i = 0; i < 10; i++) {
                arr.push(i);
            }
        }),
        bench('push with listener', () => {
            let arr = new ReactiveArray<number>();

            arr.on('push', () => {});
            arr.push(1);
        })
    );
});


test('ReactiveArray pop', async ({ bench }) => {
    await bench('pop', () => {
        let arr = new ReactiveArray([1, 2, 3, 4, 5]);

        arr.pop();
    }).run();
});


test('ReactiveArray splice', async ({ bench }) => {
    await bench.compare(
        bench('splice remove 1', () => {
            let arr = new ReactiveArray([1, 2, 3, 4, 5]);

            arr.splice(2, 1);
        }),
        bench('splice insert 1', () => {
            let arr = new ReactiveArray([1, 2, 3, 4, 5]);

            arr.splice(2, 0, 99);
        }),
        bench('splice replace 1', () => {
            let arr = new ReactiveArray([1, 2, 3, 4, 5]);

            arr.splice(2, 1, 99);
        })
    );
});


test('ReactiveArray sort', async ({ bench }) => {
    await bench.compare(
        bench('sort 10 items', () => {
            let arr = new ReactiveArray([5, 3, 8, 1, 9, 2, 7, 4, 6, 10]);

            arr.sort((a, b) => a - b);
        }),
        bench('sort 100 items', () => {
            let items = [];

            for (let i = 100; i > 0; i--) {
                items.push(i);
            }

            let arr = new ReactiveArray(items);

            arr.sort((a, b) => a - b);
        }),
        bench('sort 1000 items', () => {
            let items = [];

            for (let i = 1000; i > 0; i--) {
                items.push(i);
            }

            let arr = new ReactiveArray(items);

            arr.sort((a, b) => a - b);
        })
    );
});


test('ReactiveArray $set', async ({ bench }) => {
    await bench.compare(
        bench('$set', () => {
            let arr = new ReactiveArray([1, 2, 3, 4, 5]);

            arr.$set(2, 99);
        }),
        bench('$set same value (no-op)', () => {
            let arr = new ReactiveArray([1, 2, 3, 4, 5]);

            arr.$set(2, 3);
        })
    );
});


test('ReactiveArray events', async ({ bench }) => {
    await bench.compare(
        bench('dispatch to 1 listener', () => {
            let arr = new ReactiveArray<number>();

            arr.on('push', () => {});
            arr.push(1);
        }),
        bench('dispatch to 10 listeners', () => {
            let arr = new ReactiveArray<number>();

            for (let i = 0; i < 10; i++) {
                arr.on('push', () => {});
            }

            arr.push(1);
        }),
        bench('on + once interleaved', () => {
            let arr = new ReactiveArray<number>();

            arr.on('push', () => {});
            arr.once('push', () => {});
            arr.on('push', () => {});
            arr.push(1);
        })
    );
});


test('ReactiveArray dispose/clear', async ({ bench }) => {
    await bench.compare(
        bench('dispose with 100 items', () => {
            let items = [];

            for (let i = 0; i < 100; i++) {
                items.push(i);
            }

            let arr = new ReactiveArray(items);

            arr.dispose();
        }),
        bench('clear with 100 items', () => {
            let items = [];

            for (let i = 0; i < 100; i++) {
                items.push(i);
            }

            let arr = new ReactiveArray(items);

            arr.clear();
        })
    );
});


test('ReactiveArray concat/unshift/shift/reverse', async ({ bench }) => {
    await bench.compare(
        bench('concat 100 items', () => {
            let arr = new ReactiveArray<number>(),
                items = [];

            for (let i = 0; i < 100; i++) {
                items.push(i);
            }

            arr.concat(items);
        }),
        bench('unshift 10 items', () => {
            let arr = new ReactiveArray([1, 2, 3, 4, 5]);

            arr.unshift(10, 20, 30, 40, 50, 60, 70, 80, 90, 100);
        }),
        bench('shift', () => {
            let arr = new ReactiveArray([1, 2, 3, 4, 5]);

            arr.shift();
        }),
        bench('reverse 100 items', () => {
            let items = [];

            for (let i = 0; i < 100; i++) {
                items.push(i);
            }

            let arr = new ReactiveArray(items);

            arr.reverse();
        })
    );
});


test('ReactiveArray reactive length', async ({ bench }) => {
    await bench('read $length in effect', () => {
        let arr = new ReactiveArray([1, 2, 3]);

        let stop = effect(() => {
            arr.$length;
        });

        stop();
    }).run();
});

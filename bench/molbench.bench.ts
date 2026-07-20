import { bench, describe } from 'vitest';
import { assert, framework } from './lib/reactive-adapter';


// Ported from milomg/js-reactivity-benchmark packages/core/src/benches/kairo/molBench.ts (MIT)

let numbers = Array.from({ length: 5 }, (_, i) => i);


function fib(n: number): number {
    if (n < 2) {
        return 1;
    }

    return fib(n - 1) + fib(n - 2);
}

function hard(n: number) {
    return n + fib(16);
}

function mol() {
    let res: number[] = [];

    let a = framework.signal(0);

    let b = framework.signal(0);

    let c = framework.computed(() => (a.read() % 2) + (b.read() % 2));

    let d = framework.computed(() => numbers.map((i) => ({ x: i + (a.read() % 2) - (b.read() % 2) })));

    let e = framework.computed(() => hard(c.read() + a.read() + d.read()[0].x));

    let f = framework.computed(() => hard(d.read()[2].x || b.read()));

    let g = framework.computed(() => c.read() + (c.read() || e.read() % 2) + d.read()[4].x + f.read());

    // Keeper: G reads E conditionally; without a live subscriber E would auto-dispose on first drop
    framework.effect(() => e.read());

    framework.effect(() => res.push(hard(g.read())));

    framework.effect(() => res.push(g.read()));

    framework.effect(() => res.push(hard(f.read())));

    let i = 0;

    return async () => {
        i++;
        res.length = 0;

        await framework.withBatch(() => {
            b.write(1);
            a.write(1 + i * 2);
        });

        await framework.withBatch(() => {
            a.write(2 + i * 2);
            b.write(2);
        });

        assert(res.length > 0, 'molBench: effects did not run');
    };
}


describe('molBench', () => {
    let molRun = framework.withBuild(mol);

    bench('molBench', async () => {
        await molRun();
    });
});

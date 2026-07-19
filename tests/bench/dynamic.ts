import { bench, describe } from 'vitest';
import { assert, framework, ReactiveComputed } from '../lib/reactive-adapter';


// Dynamic-graph workloads: dependency SETS change between runs (branch on a control
// signal), exercising link/unlink churn and the link pool

function dependencySwap() {
    let a = [],
        b = [],
        computeds: ReactiveComputed<number>[] = [],
        control = framework.signal(true);

    for (let i = 0; i < 10; i++) {
        a.push(framework.signal(i));
        b.push(framework.signal(i * 2));
    }

    for (let i = 0; i < 20; i++) {
        computeds.push(framework.computed(() => {
            let source = control.read() ? a : b,
                sum = 0;

            for (let j = 0, n = source.length; j < n; j++) {
                sum += source[j].read();
            }

            return sum;
        }));
    }

    for (let i = 0, n = computeds.length; i < n; i++) {
        let c = computeds[i];

        framework.effect(() => c.read());
    }

    let flip = true;

    return async () => {
        flip = !flip;

        await framework.withBatch(() => {
            control.write(flip);
        });

        let expected = flip ? 45 : 90;

        for (let i = 0, n = computeds.length; i < n; i++) {
            assert(computeds[i].read() === expected, 'dynamic swap: unexpected sum');
        }
    };
}

function movingBranchPoint() {
    let base = framework.signal(100),
        chain: ReactiveComputed<number>[] = [],
        cut = framework.signal(0),
        depth = 30,
        source = framework.signal(1);

    // Each node conditionally links `base` (a signal — safe to drop, signals never
    // auto-dispose) while ALWAYS reading its predecessor so the chain stays alive
    chain.push(framework.computed(() => (cut.read() > 0 ? base.read() : 0) + source.read()));

    for (let i = 1; i < depth; i++) {
        let prev = chain[i - 1];

        chain.push(framework.computed(() => (cut.read() > i ? base.read() : 0) + prev.read() + 1));
    }

    let tail = chain[depth - 1];

    framework.effect(() => tail.read());

    return async () => {
        await framework.withBatch(() => {
            cut.write(15);
        });

        assert(tail.read() === 15 * 100 + 1 + (depth - 1), 'dynamic branch: unexpected tail after cut');

        await framework.withBatch(() => {
            cut.write(0);
        });

        assert(tail.read() === 1 + (depth - 1), 'dynamic branch: unexpected tail after restore');
    };
}


describe('dynamic graphs', () => {
    let branchRun = framework.withBuild(movingBranchPoint),
        swapRun = framework.withBuild(dependencySwap);

    bench('dependency set swap (20 computeds x 10 deps)', async () => {
        await swapRun();
    });

    bench('moving branch point (30-deep chain re-link)', async () => {
        await branchRun();
    });
});

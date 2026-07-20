import { bench, describe } from 'vitest';
import { assert, framework, ReactiveComputed } from './lib/reactive-adapter';


// Ported from milomg/js-reactivity-benchmark packages/core/src/benches/cellxBench.ts (MIT)

interface Layer {
    prop1: ReactiveComputed<number>;
    prop2: ReactiveComputed<number>;
    prop3: ReactiveComputed<number>;
    prop4: ReactiveComputed<number>;
}


function cellx(layers: number, before: readonly number[], after: readonly number[]) {
    let start = {
        prop1: framework.signal(1),
        prop2: framework.signal(2),
        prop3: framework.signal(3),
        prop4: framework.signal(4)
    };

    let layer: Layer = start;

    for (let i = layers; i > 0; i--) {
        let m = layer;

        layer = {
            prop1: framework.computed(() => m.prop2.read()),
            prop2: framework.computed(() => m.prop1.read() - m.prop3.read()),
            prop3: framework.computed(() => m.prop2.read() + m.prop4.read()),
            prop4: framework.computed(() => m.prop3.read())
        };
    }

    let end = layer;

    assert(end.prop1.read() === before[0], 'cellx: unexpected initial prop1');
    assert(end.prop2.read() === before[1], 'cellx: unexpected initial prop2');
    assert(end.prop3.read() === before[2], 'cellx: unexpected initial prop3');
    assert(end.prop4.read() === before[3], 'cellx: unexpected initial prop4');

    return framework.withBatch(() => {
        start.prop1.write(4);
        start.prop2.write(3);
        start.prop3.write(2);
        start.prop4.write(1);
    }).then(() => {
        assert(end.prop1.read() === after[0], 'cellx: unexpected final prop1');
        assert(end.prop2.read() === after[1], 'cellx: unexpected final prop2');
        assert(end.prop3.read() === after[2], 'cellx: unexpected final prop3');
        assert(end.prop4.read() === after[3], 'cellx: unexpected final prop4');
    });
}


describe('cellx', () => {
    bench('cellx1000', async () => {
        await framework.withBuild(() => cellx(1000, [-3, -6, -2, 2], [-2, -4, 2, 3]));
    });
});

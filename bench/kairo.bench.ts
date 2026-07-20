import { bench, describe } from 'vitest';
import { assert, framework, ReactiveComputed } from './lib/reactive-adapter';


// Ported from milomg/js-reactivity-benchmark packages/core/src/benches/kairo/* (MIT)

function avoidablePropagation() {
    let head = framework.signal(0),
        computed1 = framework.computed(() => head.read()),
        computed2 = framework.computed(() => (computed1.read(), 0)),
        computed3 = framework.computed(() => (busy(), computed2.read() + 1)),
        computed4 = framework.computed(() => computed3.read() + 2),
        computed5 = framework.computed(() => computed4.read() + 3);

    framework.effect(() => {
        computed5.read();
        busy();
    });

    return async () => {
        await framework.withBatch(() => {
            head.write(1);
        });

        assert(computed5.read() === 6, 'kairo avoidable: unexpected terminal value');

        for (let i = 0; i < 1000; i++) {
            await framework.withBatch(() => {
                head.write(i);
            });

            assert(computed5.read() === 6, 'kairo avoidable: propagation was not avoided');
        }
    };
}

function broadPropagation() {
    let counter = { count: 0 },
        head = framework.signal(0),
        last: ReactiveComputed<number> = head;

    for (let i = 0; i < 50; i++) {
        let current = framework.computed(() => head.read() + i),
            current2 = framework.computed(() => current.read() + 1);

        framework.effect(() => {
            current2.read();
            counter.count++;
        });

        last = current2;
    }

    return async () => {
        await framework.withBatch(() => {
            head.write(1);
        });

        counter.count = 0;

        for (let i = 0; i < 50; i++) {
            await framework.withBatch(() => {
                head.write(i);
            });

            assert(last.read() === i + 50, 'kairo broad: unexpected tail value');
        }

        assert(counter.count === 50 * 50, 'kairo broad: unexpected effect run count');
    };
}

function busy() {
    let a = 0;

    for (let i = 0; i < 100; i++) {
        a++;
    }

    return a;
}

function deepPropagation() {
    let counter = { count: 0 },
        head = framework.signal(0),
        len = 50,
        current: ReactiveComputed<number> = head;

    for (let i = 0; i < len; i++) {
        let c = current;

        current = framework.computed(() => c.read() + 1);
    }

    framework.effect(() => {
        current.read();
        counter.count++;
    });

    return async () => {
        let iter = 50;

        await framework.withBatch(() => {
            head.write(1);
        });

        counter.count = 0;

        for (let i = 0; i < iter; i++) {
            await framework.withBatch(() => {
                head.write(i);
            });

            assert(current.read() === len + i, 'kairo deep: unexpected tail value');
        }

        assert(counter.count === iter, 'kairo deep: unexpected effect run count');
    };
}

function diamond() {
    let counter = { count: 0 },
        current: ReactiveComputed<number>[] = [],
        head = framework.signal(0),
        width = 5;

    for (let i = 0; i < width; i++) {
        current.push(framework.computed(() => head.read() + 1));
    }

    let sum = framework.computed(() => current.map((x) => x.read()).reduce((a, b) => a + b, 0));

    framework.effect(() => {
        sum.read();
        counter.count++;
    });

    return async () => {
        await framework.withBatch(() => {
            head.write(1);
        });

        assert(sum.read() === 2 * width, 'kairo diamond: unexpected initial sum');

        counter.count = 0;

        for (let i = 0; i < 500; i++) {
            await framework.withBatch(() => {
                head.write(i);
            });

            assert(sum.read() === (i + 1) * width, 'kairo diamond: unexpected sum');
        }

        assert(counter.count === 500, 'kairo diamond: unexpected effect run count');
    };
}

function mux() {
    let heads = new Array(100).fill(null).map(() => framework.signal(0));

    let muxed = framework.computed(() => Object.fromEntries(heads.map((h) => h.read()).entries()));

    let splited = heads
        .map((_, index) => framework.computed(() => muxed.read()[index]))
        .map((x) => framework.computed(() => x.read() + 1));

    for (let i = 0, n = splited.length; i < n; i++) {
        let x = splited[i];

        framework.effect(() => x.read());
    }

    return async () => {
        for (let i = 0; i < 10; i++) {
            await framework.withBatch(() => {
                heads[i].write(i);
            });

            assert(splited[i].read() === i + 1, 'kairo mux: unexpected split value');
        }

        for (let i = 0; i < 10; i++) {
            await framework.withBatch(() => {
                heads[i].write(i * 2);
            });

            assert(splited[i].read() === i * 2 + 1, 'kairo mux: unexpected split value');
        }
    };
}

function repeatedObservers() {
    let counter = { count: 0 },
        head = framework.signal(0),
        size = 30;

    let current = framework.computed(() => {
        let result = 0;

        for (let i = 0; i < size; i++) {
            result += head.read();
        }

        return result;
    });

    framework.effect(() => {
        current.read();
        counter.count++;
    });

    return async () => {
        await framework.withBatch(() => {
            head.write(1);
        });

        assert(current.read() === size, 'kairo repeated: unexpected initial value');

        counter.count = 0;

        for (let i = 0; i < 100; i++) {
            await framework.withBatch(() => {
                head.write(i);
            });

            assert(current.read() === i * size, 'kairo repeated: unexpected value');
        }

        assert(counter.count === 100, 'kairo repeated: unexpected effect run count');
    };
}

function triangle() {
    let counter = { count: 0 },
        head = framework.signal(0),
        list: ReactiveComputed<number>[] = [],
        width = 10,
        current: ReactiveComputed<number> = head;

    for (let i = 0; i < width; i++) {
        let c = current;

        list.push(current);
        current = framework.computed(() => c.read() + 1);
    }

    let sum = framework.computed(() => list.map((x) => x.read()).reduce((a, b) => a + b, 0));

    framework.effect(() => {
        sum.read();
        counter.count++;
    });

    return async () => {
        let constant = (width * (width + 1)) / 2;

        await framework.withBatch(() => {
            head.write(1);
        });

        assert(sum.read() === constant, 'kairo triangle: unexpected initial sum');

        counter.count = 0;

        for (let i = 0; i < 100; i++) {
            await framework.withBatch(() => {
                head.write(i);
            });

            assert(sum.read() === constant - width + i * width, 'kairo triangle: unexpected sum');
        }

        assert(counter.count === 100, 'kairo triangle: unexpected effect run count');
    };
}

function unstable() {
    let counter = { count: 0 },
        head = framework.signal(0);

    let double = framework.computed(() => head.read() * 2);

    let inverse = framework.computed(() => -head.read());

    let current = framework.computed(() => {
        let result = 0;

        for (let i = 0; i < 20; i++) {
            result += head.read() % 2 ? double.read() : inverse.read();
        }

        return result;
    });

    // Keepers: this system auto-disposes a computed on last-sub unlink, so the
    // inactive branch would go permanently stale without a live subscriber
    framework.effect(() => double.read());

    framework.effect(() => inverse.read());

    framework.effect(() => {
        current.read();
        counter.count++;
    });

    return async () => {
        await framework.withBatch(() => {
            head.write(1);
        });

        assert(current.read() === 40, 'kairo unstable: unexpected initial value');

        counter.count = 0;

        for (let i = 0; i < 100; i++) {
            await framework.withBatch(() => {
                head.write(i);
            });
        }

        assert(counter.count === 100, 'kairo unstable: unexpected effect run count');
    };
}


describe('kairo', () => {
    let avoidableRun = framework.withBuild(avoidablePropagation),
        broadRun = framework.withBuild(broadPropagation),
        deepRun = framework.withBuild(deepPropagation),
        diamondRun = framework.withBuild(diamond),
        muxRun = framework.withBuild(mux),
        repeatedRun = framework.withBuild(repeatedObservers),
        triangleRun = framework.withBuild(triangle),
        unstableRun = framework.withBuild(unstable);

    bench('avoidablePropagation', async () => {
        await avoidableRun();
    });

    bench('broad', async () => {
        await broadRun();
    });

    bench('deep', async () => {
        await deepRun();
    });

    bench('diamond', async () => {
        await diamondRun();
    });

    bench('mux', async () => {
        await muxRun();
    });

    bench('repeatedObservers', async () => {
        await repeatedRun();
    });

    bench('triangle', async () => {
        await triangleRun();
    });

    bench('unstable', async () => {
        await unstableRun();
    });
});

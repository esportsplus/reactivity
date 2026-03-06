import { bench, describe } from 'vitest';
import { computed, dispose, effect, read, root, signal, write } from '~/system';


describe('signal', () => {
    bench('create signal', () => {
        signal(0);
    });

    bench('read signal (no observer)', () => {
        let s = signal(0);

        read(s);
    });

    bench('write signal (no subscribers)', () => {
        let s = signal(0);

        write(s, 1);
    });

    bench('write signal (1 subscriber)', () => {
        let s = signal(0),
            i = 0;

        effect(() => {
            read(s);
        });

        write(s, ++i);
    });

    bench('write + read cycle', () => {
        let s = signal(0);

        write(s, 1);

        read(s);
    });
});


describe('computed', () => {
    bench('create computed', () => {
        let s = signal(0);

        computed(() => read(s));
    });

    bench('read computed', () => {
        let s = signal(0),
            c = computed(() => read(s));

        read(c);
    });

    bench('computed chain (depth 5)', () => {
        let s = signal(0),
            c1 = computed(() => read(s) + 1),
            c2 = computed(() => read(c1) + 1),
            c3 = computed(() => read(c2) + 1),
            c4 = computed(() => read(c3) + 1),
            c5 = computed(() => read(c4) + 1);

        read(c5);
    });

    bench('computed diamond', () => {
        let s = signal(0),
            a = computed(() => read(s) + 1),
            b = computed(() => read(s) * 2),
            c = computed(() => read(a) + read(b));

        read(c);
    });
});


describe('effect', () => {
    bench('create + dispose effect', () => {
        let stop = effect(() => {});

        stop();
    });

    bench('effect with 1 signal', () => {
        let s = signal(0);

        let stop = effect(() => {
            read(s);
        });

        stop();
    });

    bench('effect with 10 signals', () => {
        let signals: ReturnType<typeof signal<number>>[] = [];

        for (let i = 0; i < 10; i++) {
            signals.push(signal(i));
        }

        let stop = effect(() => {
            for (let i = 0; i < 10; i++) {
                read(signals[i]);
            }
        });

        stop();
    });
});


describe('propagation', () => {
    bench('1 signal → 1 effect (sync write)', () => {
        let s = signal(0),
            i = 0;

        effect(() => {
            read(s);
        });

        write(s, ++i);
    });

    bench('1 signal → 10 effects (sync write)', () => {
        let s = signal(0),
            i = 0;

        for (let j = 0; j < 10; j++) {
            effect(() => {
                read(s);
            });
        }

        write(s, ++i);
    });

    bench('10 signals → 1 computed → 1 effect', () => {
        let signals: ReturnType<typeof signal<number>>[] = [],
            i = 0;

        for (let j = 0; j < 10; j++) {
            signals.push(signal(j));
        }

        let c = computed(() => {
            let sum = 0;

            for (let j = 0; j < 10; j++) {
                sum += read(signals[j]);
            }

            return sum;
        });

        effect(() => {
            read(c);
        });

        write(signals[0], ++i);
    });

    bench('deep chain (10 computeds)', () => {
        let s = signal(0),
            chain: ReturnType<typeof computed>[] = [],
            i = 0;

        chain[0] = computed(() => read(s) + 1);

        for (let j = 1; j < 10; j++) {
            let prev = chain[j - 1];

            chain[j] = computed(() => read(prev) + 1);
        }

        effect(() => {
            read(chain[9]);
        });

        write(s, ++i);
    });

    bench('wide fan-out (1 signal → 100 computeds)', () => {
        let s = signal(0),
            i = 0;

        for (let j = 0; j < 100; j++) {
            computed(() => read(s) + j);
        }

        write(s, ++i);
    });
});


describe('memory', () => {
    bench('create + dispose 100 computeds', () => {
        let computeds: ReturnType<typeof computed<number>>[] = [];

        for (let i = 0; i < 100; i++) {
            computeds.push(computed(() => i));
        }

        for (let i = 0; i < 100; i++) {
            dispose(computeds[i]);
        }
    });

    bench('link pool (create + dispose cycle)', () => {
        let s = signal(0);

        for (let i = 0; i < 100; i++) {
            let c = computed(() => read(s));

            read(c);
            dispose(c);
        }
    });

    bench('root scope create + dispose', () => {
        root((dispose) => {
            let s = signal(0);

            computed(() => read(s));

            dispose();
        });
    });
});

import { test } from 'vitest';
import { computed, dispose, effect, flush, onCleanup, read, root, signal, write } from '~/system';
import type { Computed } from '~/system';


const CHURN = 1000;


function noop() {
}

// Owner registrations still held after churn: user cleanups plus owned children (`owned` is absent
// before the owned list existed, so this also counts a baseline tree's closure array)
function retained(node: Computed<unknown>): number {
    let n = node.cleanup === null ? 0 : typeof node.cleanup === 'function' ? 1 : node.cleanup.length;

    for (let child = node.owned; child; child = child.nextOwned) {
        n++;
    }

    return n;
}


test('ownership churn', async ({ bench }) => {
    await bench.compare(
        bench(`${CHURN} child roots created + disposed under one owner`, () => {
            let owner = computed(() => {
                for (let i = 0; i < CHURN; i++) {
                    root((d) => {
                        onCleanup(noop);
                        d();
                    });
                }

                return 0;
            });

            dispose(owner);
        }),
        bench(`${CHURN} child effects created + disposed under one owner`, () => {
            let owner = computed(() => {
                for (let i = 0; i < CHURN; i++) {
                    effect(() => {
                        onCleanup(noop);
                    })();
                }

                return 0;
            });

            dispose(owner);
        })
    );
});


test('ownership churn retention', () => {
    let gc = (globalThis as { gc?: () => void }).gc,
        heap = 0;

    for (let n of [1000, 10000]) {
        gc?.();

        let before = process.memoryUsage().heapUsed,
            owner = computed(() => {
                for (let i = 0; i < n; i++) {
                    root((d) => {
                        onCleanup(noop);
                        d();
                    });
                }

                return 0;
            });

        gc?.();
        heap = process.memoryUsage().heapUsed - before;

        console.log(`[ownership] churn ${n}: retained registrations = ${retained(owner as Computed<unknown>)}, heap delta = ${gc ? `${(heap / 1024).toFixed(1)} KiB` : 'n/a (run with --expose-gc)'}`);
        dispose(owner);
    }
});


test('ownership effect re-run', async ({ bench }) => {
    let s = signal(0),
        nested = signal(0),
        i = 0;

    let stop = effect(() => {
        read(s);

        for (let j = 0; j < 10; j++) {
            effect(() => {
                read(nested);
                onCleanup(noop);
            });
        }
    });

    await bench.compare(
        bench('re-run effect owning 10 child effects', () => {
            write(s, ++i);
            flush();
        }),
        bench('re-run 10 child effects (parent stable)', () => {
            write(nested, ++i);
            flush();
        })
    );

    stop();
});


test('ownership tree dispose', async ({ bench }) => {
    await bench.compare(
        bench('deep owner tree (1000 nested roots) disposed at once', () => {
            root((d) => {
                let parent = (depth: number): void => {
                    if (depth === 0) {
                        return;
                    }

                    root(() => {
                        onCleanup(noop);
                        parent(depth - 1);
                    });
                };

                parent(1000);
                d();
            });
        }),
        bench('deep owner tree (200 nested effects) disposed at once', () => {
            root((d) => {
                let parent = (depth: number): void => {
                    if (depth === 0) {
                        return;
                    }

                    effect(() => {
                        onCleanup(noop);
                        parent(depth - 1);
                    });
                };

                parent(200);
                d();
            });
        }),
        bench('wide owner tree (1000 child effects) disposed at once', () => {
            root((d) => {
                for (let i = 0; i < 1000; i++) {
                    effect(() => {
                        onCleanup(noop);
                    });
                }

                d();
            });
        }),
        bench('wide x deep owner tree (32 x 32 effects) disposed at once', () => {
            root((d) => {
                for (let i = 0; i < 32; i++) {
                    effect(() => {
                        for (let j = 0; j < 32; j++) {
                            effect(() => {
                                onCleanup(noop);
                            });
                        }
                    });
                }

                d();
            });
        })
    );
});


test('ownership single cleanup', async ({ bench }) => {
    let s = signal(0),
        i = 0;

    let stop = effect(() => {
        read(s);
        onCleanup(noop);
    });

    await bench.compare(
        bench('effect re-run with 1 cleanup', () => {
            write(s, ++i);
            flush();
        }),
        bench('computed create + dispose with 1 cleanup', () => {
            dispose(computed(() => {
                onCleanup(noop);
                return 0;
            }));
        }),
        bench('root create + dispose with 1 cleanup', () => {
            root((d) => {
                onCleanup(noop);
                d();
            });
        })
    );

    stop();
});

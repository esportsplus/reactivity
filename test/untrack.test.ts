import { describe, expect, it } from 'vitest';
import { computed, effect, hasOwner, onCleanup, peek, read, root, signal, untrack, write } from '~/system';
import type { Computed } from '~/system';


describe('untrack', () => {
    it('does not re-run an effect for a signal read only inside untrack, and sees current values', async () => {
        let a = signal(1),
            b = signal(10),
            calls = 0,
            seenB: number[] = [];

        effect(() => {
            read(a);
            seenB.push(untrack(() => read(b)));
            calls++;
        });

        expect(calls).toBe(1);
        expect(seenB).toEqual([10]);

        write(b, 20);
        await Promise.resolve();

        // b changed but was only ever read inside untrack — the effect must not re-run
        expect(calls).toBe(1);

        write(a, 2);
        await Promise.resolve();

        // a re-runs the effect; the untracked read of b picks up its current value
        expect(calls).toBe(2);
        expect(seenB).toEqual([10, 20]);
    });

    it('restores the observer when fn throws, so a later read in the same effect still tracks', async () => {
        let a = signal(1),
            b = signal(1),
            calls = 0;

        effect(() => {
            calls++;

            try {
                untrack(() => {
                    throw new Error('untrack boom');
                });
            }
            catch {
                // swallow — only the observer-restoration-after-throw behavior is under test
            }

            read(a);
            read(b);
        });

        expect(calls).toBe(1);

        write(a, 2);
        await Promise.resolve();

        expect(calls).toBe(2);

        write(b, 2);
        await Promise.resolve();

        expect(calls).toBe(3);
    });

    it('returns the value fn produces', () => {
        expect(untrack(() => 42)).toBe(42);
    });
});


describe('untrack ownership', () => {
    it('an effect created inside untrack during a re-run is disposed by the next re-run and by dispose', async () => {
        let inner = signal(0),
            innerRuns: string[] = [],
            outer = signal(0),
            stop = effect(() => {
                let gen = read(outer);

                untrack(() => {
                    effect(() => {
                        innerRuns.push(`${gen}:${read(inner)}`);
                    });
                });
            });

        write(outer, 1);
        await Promise.resolve();

        expect(innerRuns).toEqual(['0:0', '1:0']);

        write(inner, 1);
        await Promise.resolve();

        // Only generation 1's inner effect is alive; generation 0's was disposed by the re-run
        expect(innerRuns).toEqual(['0:0', '1:0', '1:1']);

        stop();
        write(inner, 2);
        await Promise.resolve();

        expect(innerRuns).toEqual(['0:0', '1:0', '1:1']);
    });

    it('onCleanup inside untrack runs on the next re-run and on dispose', async () => {
        let log: number[] = [],
            s = signal(0),
            stop = effect(() => {
                let v = read(s);

                untrack(() => onCleanup(() => { log.push(v); }));
            });

        write(s, 1);
        await Promise.resolve();

        expect(log).toEqual([0]);

        stop();

        expect(log).toEqual([0, 1]);
    });

    it('tears down untracked children and cleanups in registration order', async () => {
        let log: string[] = [],
            s = signal(0),
            stop = effect(() => {
                read(s);
                onCleanup(() => { log.push('a'); });
                untrack(() => {
                    effect(() => {
                        onCleanup(() => { log.push('b'); });
                    });
                    onCleanup(() => { log.push('c'); });
                });
                root((d) => {
                    onCleanup(() => { log.push('d'); });
                });
            });

        write(s, 1);
        await Promise.resolve();

        expect(log).toEqual(['a', 'b', 'c', 'd']);

        stop();

        // dispose() drains owned children after the owner's own cleanups, exactly as for tracked children
        expect(log.slice(4).sort()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('reads inside untrack still do not subscribe, nor do reads of untracked children', async () => {
        let a = signal(0),
            b = signal(0),
            runs = 0;

        effect(() => {
            runs++;
            untrack(() => {
                read(a);
                computed(() => read(b));
            });
        });

        write(a, 1);
        write(b, 1);
        await Promise.resolve();

        expect(runs).toBe(1);
    });

    it('outside any computation creations stay unowned', () => {
        let log: string[] = [],
            stop = untrack(() => {
                onCleanup(() => { log.push('dropped'); });

                return effect(() => {
                    onCleanup(() => { log.push('effect'); });
                });
            }),
            c = untrack(() => computed(() => 1)) as Computed<unknown>;

        expect(c.owner).toBe(null);

        stop();

        expect(log).toEqual(['effect']);
    });

    it('inside root((d) => ...) creations stay owned by the root', () => {
        let log: string[] = [];

        root((d) => {
            untrack(() => {
                onCleanup(() => { log.push('cleanup'); });
                effect(() => {
                    onCleanup(() => { log.push('effect'); });
                });
            });
            d();
        });

        expect(log).toEqual(['cleanup', 'effect']);
    });

    it('nested untrack keeps the running computation as owner', async () => {
        let log: number[] = [],
            s = signal(0),
            stop = effect(() => {
                let v = read(s);

                untrack(() => untrack(() => onCleanup(() => { log.push(v); })));
            });

        write(s, 1);
        await Promise.resolve();
        stop();

        expect(log).toEqual([0, 1]);
    });

    it('a zero-arg root inside untrack stays detached', async () => {
        let log: number[] = [],
            s = signal(0),
            stop = effect(() => {
                let v = read(s);

                untrack(() => root(() => {
                    onCleanup(() => { log.push(-1); });
                    untrack(() => effect(() => {
                        onCleanup(() => { log.push(v); });
                    }));
                }));
            });

        write(s, 1);
        await Promise.resolve();
        stop();

        // Neither the root's cleanup (no owner) nor its effects are torn down by the outer effect
        expect(log).toEqual([]);
    });

    it('restores owner and observer when fn throws', async () => {
        let a = signal(0),
            runs = 0;

        effect(() => {
            runs++;

            try {
                untrack(() => {
                    throw new Error('boom');
                });
            }
            catch {
                // only restoration is under test
            }

            read(a);
        });

        expect(untrack(() => hasOwner())).toBe(false);

        write(a, 1);
        await Promise.resolve();

        expect(runs).toBe(2);
    });

    it('an async computed created inside untrack is owned by the running computation', async () => {
        let log: string[] = [],
            s = signal(0),
            stop = effect(() => {
                let v = read(s);

                untrack(() => computed(async () => {
                    onCleanup(() => { log.push(`factory ${v}`); });
                    return v;
                }));
            });

        write(s, 1);
        await Promise.resolve();

        expect(log).toEqual(['factory 0']);

        stop();

        expect(log).toEqual(['factory 0', 'factory 1']);
    });
});


describe('peek', () => {
    it('returns the current value of a signal', () => {
        let s = signal(5);

        expect(peek(s)).toBe(5);

        write(s, 6);

        expect(peek(s)).toBe(6);
    });

    it('returns the up-to-date value of a dirty computed without subscribing', async () => {
        let s = signal(1),
            c = computed(() => read(s) * 2),
            writerRuns = 0;

        effect(() => {
            read(c);
        });

        effect(() => {
            read(s);
            writerRuns++;
        });

        expect(writerRuns).toBe(1);

        write(s, 5);

        // No await — c is queued/dirty, stabilize() has not run yet
        expect(peek(c)).toBe(10);

        // peek must not create a subscription: the writer effect's run count is untouched
        expect(writerRuns).toBe(1);

        await Promise.resolve();
        await Promise.resolve();
    });

    it('does not add a dependency link when called from inside a tracking scope', async () => {
        let s = signal(1),
            c = computed(() => read(s) * 2),
            caller = computed(() => peek(c));

        expect(read(caller)).toBe(2);
        expect(caller.deps).toBe(null);

        write(s, 5);
        await Promise.resolve();
        await Promise.resolve();

        // caller never subscribed to c, so it does not react to s changing
        expect(read(caller)).toBe(2);
    });

    it('rethrows the cached error for an errored computed', () => {
        let s = signal(0),
            c = computed(() => {
                if (read(s) > 0) {
                    throw new Error('peek boom');
                }

                return read(s);
            });

        expect(peek(c)).toBe(0);

        write(s, 1);

        expect(() => peek(c)).toThrow('peek boom');
    });
});

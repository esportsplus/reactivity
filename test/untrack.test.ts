import { describe, expect, it } from 'vitest';
import { computed, effect, peek, read, signal, untrack, write } from '~/system';


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

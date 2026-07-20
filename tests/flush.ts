import { describe, expect, it } from 'vitest';
import { batch, computed, effect, flush, read, signal, write } from '~/system';


describe('flush()', () => {
    it('runs the dependent effect synchronously before returning', () => {
        let runs = 0,
            s = signal(0);

        effect(() => {
            runs++;
            read(s);
        });

        expect(runs).toBe(1);

        write(s, 1);

        expect(runs).toBe(1);

        flush();

        expect(runs).toBe(2);
    });

    it('drains a write-during-effect reschedule tail before returning', () => {
        let s = signal(0),
            c = computed(() => read(s) + 1),
            innerRuns = 0,
            outerRuns = 0,
            proof = signal(0);

        effect(() => {
            outerRuns++;

            if (read(c) === 2) {
                write(proof, 1);
            }
        });

        effect(() => {
            innerRuns++;
            read(proof);
        });

        expect(outerRuns).toBe(1);
        expect(innerRuns).toBe(1);

        write(s, 1);
        flush();

        expect(outerRuns).toBe(2);
        expect(innerRuns).toBe(2);
        expect(read(proof)).toBe(1);
    });

    it('is a safe no-op when called re-entrantly during stabilization, and does not block subsequent propagation', () => {
        let effectARuns = 0,
            effectBRuns = 0,
            s = signal(0),
            t = signal(0);

        effect(() => {
            effectARuns++;

            if (read(s) === 1) {
                flush();
                write(t, 99);
            }
        });

        effect(() => {
            effectBRuns++;
            read(t);
        });

        write(s, 1);
        flush();

        expect(effectARuns).toBe(2);
        expect(effectBRuns).toBe(2);
        expect(read(t)).toBe(99);
    });

    it('is a no-op when nothing is pending', () => {
        expect(() => flush()).not.toThrow();
    });

    it('leaves the previously-queued microtask as a no-op after a manual flush', async () => {
        let runs = 0,
            s = signal(0);

        effect(() => {
            runs++;
            read(s);
        });

        write(s, 1);
        flush();

        expect(runs).toBe(2);

        await Promise.resolve();
        await Promise.resolve();

        expect(runs).toBe(2);
    });
});

describe('batch()', () => {
    it('defers scheduling until the batch completes, producing exactly one effect re-run', async () => {
        let runs = 0,
            s1 = signal(0),
            s2 = signal(0);

        effect(() => {
            runs++;
            read(s1);
            read(s2);
        });

        expect(runs).toBe(1);

        batch(() => {
            write(s1, 1);
            write(s2, 2);
        });

        await Promise.resolve();

        expect(runs).toBe(2);
    });

    it('settles synchronously when paired with flush', () => {
        let runs = 0,
            s1 = signal(0),
            s2 = signal(0);

        effect(() => {
            runs++;
            read(s1);
            read(s2);
        });

        batch(() => {
            write(s1, 1);
            write(s2, 2);
        });
        flush();

        expect(runs).toBe(2);
    });

    it('returns the wrapped function value', () => {
        let result = batch(() => 42);

        expect(result).toBe(42);
    });

    it('restores depth when the wrapped function throws', () => {
        let s = signal(0);

        expect(() => {
            batch(() => {
                write(s, 1);
                throw new Error('reactivity: test error');
            });
        }).toThrow('reactivity: test error');

        // depth must have unwound to 0, so a fresh write schedules normally instead of deferring forever.
        let runs = 0;

        effect(() => {
            runs++;
            read(s);
        });

        expect(runs).toBe(1);

        write(s, 2);
        flush();

        expect(runs).toBe(2);
    });
});

import { describe, expect, it } from 'vitest';
import { computed, effect, read, signal, write } from '~/system';


// Correctness guarantees the algorithm items (read-version-dedup,
// global-version-fast-path, pending-only-writes) must preserve

describe('glitch freedom', () => {
    it('diamond: join computes exactly once per write and never observes mixed state', async () => {
        let s = signal(1),
            observed: [number, number][] = [],
            b = computed(() => read(s) + 1),
            c = computed(() => read(s) * 2),
            d = computed(() => {
                let bv = read(b),
                    cv = read(c);

                observed.push([bv, cv]);

                return bv + cv;
            });

        effect(() => {
            read(d);
        });

        expect(read(d)).toBe(4);

        observed.length = 0;

        write(s, 2);
        await Promise.resolve();

        // One run, and the pair is consistent for s=2 — never a mixed b/c state
        expect(observed).toEqual([[3, 4]]);
        expect(read(d)).toBe(7);

        observed.length = 0;

        write(s, 5);
        await Promise.resolve();

        expect(observed).toEqual([[6, 10]]);
        expect(read(d)).toBe(16);
    });

    it('unstable: dynamic dep swap mid-propagation settles correctly with no double-run', async () => {
        let runs = 0,
            s = signal(1),
            double = computed(() => read(s) * 2),
            inverse = computed(() => -read(s)),
            current = computed(() => {
                runs++;

                return read(s) % 2 ? read(double) : read(inverse);
            });

        // Keepers hold a subscription on both branches — last-sub unlink auto-disposes a computed
        effect(() => {
            read(double);
        });

        effect(() => {
            read(inverse);
        });

        effect(() => {
            read(current);
        });

        expect(read(current)).toBe(2);

        runs = 0;

        write(s, 2);
        await Promise.resolve();

        // Swapped from double to inverse in one settle pass
        expect(read(current)).toBe(-2);
        expect(runs).toBe(1);

        runs = 0;

        write(s, 3);
        await Promise.resolve();

        // Swapped back
        expect(read(current)).toBe(6);
        expect(runs).toBe(1);
    });

    it('repeated observers: one effect reading the same signal 3x re-runs exactly once per write', async () => {
        let runs = 0,
            s = signal(0);

        effect(() => {
            read(s);
            read(s);
            read(s);
            runs++;
        });

        expect(runs).toBe(1);

        write(s, 1);
        await Promise.resolve();

        expect(runs).toBe(2);

        write(s, 2);
        await Promise.resolve();

        expect(runs).toBe(3);
    });
});

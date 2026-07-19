import { describe, expect, it } from 'vitest';
import { computed, effect, read, signal, write } from '~/system';


describe('pending-only writes', () => {
    it('N writes to one signal between settles produce exactly one fan-out', async () => {
        let runs = 0,
            s = signal(0);

        let c = computed(() => {
            runs++;

            return read(s);
        });

        effect(() => {
            read(c);
        });

        runs = 0;

        write(s, 1);
        write(s, 2);
        write(s, 3);
        write(s, 4);
        write(s, 5);

        await Promise.resolve();
        await Promise.resolve();

        // One drain, one recompute — not one per write
        expect(runs).toBe(1);
        expect(read(c)).toBe(5);
    });

    it('an unchanged recompute does not cascade to downstream subscribers', async () => {
        let downstream = 0,
            s = signal(0);

        // Parity: value only changes on even inputs, so odd writes recompute c but must not re-run d
        let c = computed(() => read(s) - (read(s) % 2));

        let d = computed(() => {
            downstream++;

            return read(c);
        });

        effect(() => {
            read(d);
        });

        downstream = 0;

        write(s, 1);
        await Promise.resolve();
        await Promise.resolve();

        // c recomputed to the same value (0) → no propagation to d
        expect(downstream).toBe(0);
        expect(read(d)).toBe(0);

        write(s, 2);
        await Promise.resolve();
        await Promise.resolve();

        expect(downstream).toBe(1);
        expect(read(d)).toBe(2);
    });

    it('tracked reads converge on pending writes at settle (invariant 1, parity with main)', async () => {
        let observed: number[] = [],
            s = signal(0),
            t = signal(10);

        let c = computed(() => read(t));

        // Effect writes t then reads c, and a downstream effect reads c too — at settle every
        // tracked reader must see the pending write reflected (main's coherence contract, which
        // the deferred queue must preserve rather than strand a write un-fanned-out)
        effect(() => {
            let v = read(s);

            if (v > 0) {
                write(t, v * 100);
            }

            observed.push(read(c));
        });

        let downstream = 0;

        effect(() => {
            read(c);
            downstream++;
        });

        observed.length = 0;
        downstream = 0;

        write(s, 1);
        await Promise.resolve();
        await Promise.resolve();

        // Both readers and the node itself settle on the written value — the queue never drops it
        expect(read(c)).toBe(100);
        expect(observed[observed.length - 1]).toBe(100);
        expect(downstream).toBeGreaterThan(0);
    });

    it('repeated writes across two signals coalesce, final graph values correct', async () => {
        let runs = 0,
            a = signal(1),
            b = signal(1);

        let sum = computed(() => {
            runs++;

            return read(a) + read(b);
        });

        effect(() => {
            read(sum);
        });

        runs = 0;

        write(a, 2);
        write(a, 3);
        write(b, 4);
        write(b, 5);

        await Promise.resolve();
        await Promise.resolve();

        expect(runs).toBe(1);
        expect(read(sum)).toBe(8);
    });
});

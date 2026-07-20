import { describe, expect, it } from 'vitest';
import { computed, effect, read, signal, write } from '~/system';
import type { Computed } from '~/system';


function countDeps(node: Computed<unknown>): number {
    let n = 0;

    for (let link = node.deps; link; link = link.nextDep) {
        n++;
    }

    return n;
}


describe('read-version dedup', () => {
    it('interleaved repeat reads (x, y, x) hold exactly 2 dep links and re-run once per write', async () => {
        let runs = 0,
            x = signal(0),
            y = signal(0);

        let c = computed(() => {
            runs++;

            return read(x) + read(y) + read(x);
        });

        effect(() => {
            read(c);
        });

        expect(countDeps(c as Computed<unknown>)).toBe(2);
        expect(runs).toBe(1);

        write(x, 1);
        await Promise.resolve();

        // Steady-state re-run exercises the RECOMPUTING reuse paths
        expect(countDeps(c as Computed<unknown>)).toBe(2);
        expect(runs).toBe(2);
        expect(read(c)).toBe(2);

        write(x, 2);
        await Promise.resolve();

        expect(countDeps(c as Computed<unknown>)).toBe(2);
        expect(runs).toBe(3);
        expect(read(c)).toBe(4);
    });

    it('outer first-read of a dep stamped only by a nested creation still links (no false positive)', async () => {
        let outerRuns = 0,
            s = signal(1);

        effect(() => {
            outerRuns++;

            // Inline creation: depsTail is null, so the inner recompute nests here and stamps s.
            // Constant value keeps the inner from ever propagating — the outer re-runs on s
            // writes ONLY through its own direct link.
            computed(() => (read(s), 0));

            read(s);
        });

        expect(outerRuns).toBe(1);

        write(s, 2);
        await Promise.resolve();

        expect(outerRuns).toBe(2);

        write(s, 3);
        await Promise.resolve();

        expect(outerRuns).toBe(3);
    });

    it('repeat reads across a nested-recompute boundary re-link or reuse, never drop', async () => {
        let runs = 0,
            s = signal(1);

        let c = computed(() => {
            runs++;

            // Inline nested recompute reads s and stamps it under the inner run's version.
            // Undefined return keeps the inner from ever propagating back into c.
            computed(() => {
                read(s);
            });

            return read(s) + read(s);
        });

        effect(() => {
            read(c);
        });

        expect(read(c)).toBe(2);
        expect(runs).toBe(1);

        // inner + one s link — the repeat read fast-exits, the boundary read still links
        expect(countDeps(c as Computed<unknown>)).toBe(2);

        write(s, 2);
        await Promise.resolve();

        expect(read(c)).toBe(4);
        expect(runs).toBe(2);
        expect(countDeps(c as Computed<unknown>)).toBe(2);

        write(s, 5);
        await Promise.resolve();

        expect(read(c)).toBe(10);
        expect(runs).toBe(3);
        expect(countDeps(c as Computed<unknown>)).toBe(2);
    });
});

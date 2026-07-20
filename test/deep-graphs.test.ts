import { describe, expect, it } from 'vitest';
import { computed, effect, flush, peek, read, signal, write } from '~/system';


// Depth chosen well past the V8 call-stack frame limit (~10-15k): a recursive notify/update/dispose
// would RangeError here, an iterative walk does not.
const DEPTH = 200000;


describe('deep graphs', () => {
    it('a 200k-deep chain settles at the leaf with no overflow (scheduled + pull paths)', () => {
        let chain: ReturnType<typeof computed<number>>[] = [],
            s = signal(0),
            seen = -1;

        chain[0] = computed(() => read(s) + 1);

        for (let i = 1; i < DEPTH; i++) {
            let prev = chain[i - 1];

            chain[i] = computed(() => read(prev) + 1);
        }

        let leaf = chain[DEPTH - 1];

        let stop = effect(() => {
            seen = read(leaf);
        });

        expect(seen).toBe(DEPTH);

        // Scheduled path: write + flush drains the height buckets.
        write(s, 1);
        flush();

        expect(seen).toBe(DEPTH + 1);

        // Pull path: a synchronous peek before flush forces the notify broadcast + the update walk.
        write(s, 2);

        expect(peek(leaf)).toBe(DEPTH + 2);

        flush();

        expect(seen).toBe(DEPTH + 2);

        stop();
    }, 30000);

    it('a wide fan-out with deep branches settles (notify sibling traversal)', () => {
        let leaves: ReturnType<typeof computed<number>>[] = [],
            observed = -1,
            s = signal(1),
            width = 100,
            branchDepth = 50;

        for (let b = 0; b < width; b++) {
            let node = computed(() => read(s));

            for (let d = 0; d < branchDepth; d++) {
                let prev = node;

                node = computed(() => read(prev) + 1);
            }

            leaves.push(node);
        }

        let sum = computed(() => {
            let total = 0;

            for (let i = 0, n = leaves.length; i < n; i++) {
                total += read(leaves[i]);
            }

            return total;
        });

        let stop = effect(() => {
            observed = read(sum);
        });

        expect(observed).toBe(width * (1 + branchDepth));

        write(s, 2);

        expect(peek(sum)).toBe(width * (2 + branchDepth));

        flush();

        expect(observed).toBe(width * (2 + branchDepth));

        stop();
    });

    it('a diamond recomputes the sink once per source change (glitch-free, no redundant checks)', () => {
        let aRuns = 0,
            bRuns = 0,
            cRuns = 0,
            s = signal(1);

        let a = computed(() => {
            aRuns++;

            return read(s) + 1;
        });

        let b = computed(() => {
            bRuns++;

            return read(s) * 2;
        });

        let c = computed(() => {
            cRuns++;

            return read(a) + read(b);
        });

        let stop = effect(() => {
            read(c);
        });

        expect(aRuns).toBe(1);
        expect(bRuns).toBe(1);
        expect(cRuns).toBe(1);
        expect(peek(c)).toBe(4);

        write(s, 2);
        flush();

        expect(aRuns).toBe(2);
        expect(bRuns).toBe(2);
        expect(cRuns).toBe(2);
        expect(peek(c)).toBe(7);

        stop();
    });

    it('a dynamic conditional dep does not over-recompute (DIRTY-break)', () => {
        let a = signal(10),
            b = signal(20),
            cRuns = 0,
            s = signal(true);

        let c = computed(() => {
            cRuns++;

            return read(s) ? read(a) : read(b);
        });

        let stop = effect(() => {
            read(c);
        });

        expect(cRuns).toBe(1);
        expect(peek(c)).toBe(10);

        // b is not a dep while s is true.
        write(b, 99);
        flush();

        expect(cRuns).toBe(1);

        write(s, false);
        flush();

        expect(cRuns).toBe(2);
        expect(peek(c)).toBe(99);

        // a is no longer a dep.
        write(a, 5);
        flush();

        expect(cRuns).toBe(2);

        stop();
    });

    it('teardown of a 200k-deep chain completes without overflow; cleanup fires once per node', () => {
        let chain: ReturnType<typeof computed<number>>[] = [],
            cleanups = 0,
            s = signal(0);

        chain[0] = computed((onCleanup) => {
            onCleanup(() => cleanups++);

            return read(s) + 1;
        });

        for (let i = 1; i < DEPTH; i++) {
            let prev = chain[i - 1];

            chain[i] = computed((onCleanup) => {
                onCleanup(() => cleanups++);

                return read(prev) + 1;
            });
        }

        let stop = effect(() => {
            read(chain[DEPTH - 1]);
        });

        stop();

        expect(cleanups).toBe(DEPTH);

        // Nothing survives to re-run.
        write(s, 1);
        flush();

        expect(cleanups).toBe(DEPTH);
    }, 30000);
});

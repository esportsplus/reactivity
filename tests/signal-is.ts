import { describe, expect, it } from 'vitest';
import { computed, effect, onCleanup, read, signal, write } from '~/system';

// signal.is(node, key) rides a Map for entry lookup — SameValueZero semantics: NaN keys match
// themselves and ±0 collapse, slightly wider than the settled === for those two cases. Object keys
// compare by reference and MUST be stable (a re-allocated key object never matches). The initial
// node.value === key snapshot uses ===.

const settle = () => Promise.resolve().then(() => Promise.resolve());


describe('signal.is per-key selector', () => {
    it('re-runs on transitions into/out of the key, not on writes between other keys', async () => {
        let runs = 0,
            s = signal('a');

        effect(() => {
            runs++;
            signal.is(s, 'b');
        });

        runs = 0;

        write(s, 'c');
        await settle();
        expect(runs).toBe(0);

        write(s, 'b');
        await settle();
        expect(runs).toBe(1);

        write(s, 'd');
        await settle();
        expect(runs).toBe(2);

        write(s, 'e');
        await settle();
        expect(runs).toBe(2);
    });

    it('returns the correct boolean at first call, tracked and untracked', () => {
        let s = signal('x'),
            tracked: boolean | null = null;

        expect(signal.is(s, 'x')).toBe(true);
        expect(signal.is(s, 'y')).toBe(false);

        effect(() => {
            tracked = signal.is(s, 'x');
        });

        expect(tracked).toBe(true);
    });

    it('is lazy: keys stays null until a tracked call, one entry per distinct key', () => {
        let s = signal(0);

        expect(s.keys).toBe(null);

        signal.is(s, 1);
        expect(s.keys).toBe(null);

        effect(() => {
            signal.is(s, 1);
            signal.is(s, 2);
            signal.is(s, 1);
        });

        expect(s.keys).not.toBe(null);
        expect(s.keys!.size).toBe(2);
    });

    it('evicts entries on last unsubscribe and nulls keys when the map empties', () => {
        let s = signal(0),
            stop1 = effect(() => {
                signal.is(s, 1);
            }),
            stop2 = effect(() => {
                signal.is(s, 2);
            });

        expect(s.keys!.size).toBe(2);

        stop1();
        expect(s.keys!.size).toBe(1);

        stop2();
        expect(s.keys).toBe(null);
    });

    it('leaves the computed last-unsub auto-dispose behavior unchanged', () => {
        let cleaned = 0,
            s = signal(0);

        let stop = effect(() => {
            let c = computed(() => {
                onCleanup(() => {
                    cleaned++;
                });

                return read(s);
            });

            read(c);
        });

        expect(cleaned).toBe(0);

        // Disposing the effect unlinks c's last subscriber → c still auto-disposes and its cleanup fires.
        stop();
        expect(cleaned).toBe(1);
    });

    it('fans out keys independently; a write touches only the prev and next entries', async () => {
        let s = signal('a'),
            runs1 = 0,
            runs2 = 0,
            runs3 = 0;

        effect(() => {
            runs1++;
            signal.is(s, 'a');
        });
        effect(() => {
            runs2++;
            signal.is(s, 'b');
        });
        effect(() => {
            runs3++;
            signal.is(s, 'c');
        });

        runs1 = runs2 = runs3 = 0;

        write(s, 'b');
        await settle();

        expect(runs1).toBe(1);
        expect(runs2).toBe(1);
        expect(runs3).toBe(0);
    });

    it('NaN key: the Map reuses one stable entry and transitions fan out (SameValueZero caveat)', async () => {
        let observed: boolean[] = [],
            runs = 0,
            s = signal<number>(0);

        effect(() => {
            runs++;
            observed.push(signal.is(s, NaN));
        });

        runs = 0;
        observed.length = 0;

        expect(s.keys!.size).toBe(1);

        write(s, NaN);
        await settle();

        expect(runs).toBe(1);
        expect(observed[observed.length - 1]).toBe(true);
        expect(s.keys!.size).toBe(1);
    });

    it('object key compares by reference: a stable key matches, a re-allocated one does not', async () => {
        let k = { id: 1 },
            observed: boolean[] = [],
            s = signal<object>(k);

        effect(() => {
            observed.push(signal.is(s, k));
        });

        expect(observed[0]).toBe(true);

        observed.length = 0;

        write(s, { id: 1 });
        await settle();
        expect(observed[observed.length - 1]).toBe(false);

        write(s, k);
        await settle();
        expect(observed[observed.length - 1]).toBe(true);
    });
});

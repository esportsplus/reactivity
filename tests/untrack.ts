import { describe, expect, it } from 'vitest';
import { computed, effect, peek, read, signal, untrack, write } from '~/system';


describe('untrack', () => {
    it('returns the fn result and reads the current value', () => {
        let s = signal(5);

        expect(untrack(() => read(s))).toBe(5);
        expect(untrack(() => 42)).toBe(42);

        write(s, 9);

        expect(untrack(() => read(s))).toBe(9);
    });

    it('shields only the reads inside it; sibling tracked reads still subscribe', async () => {
        let calls = 0,
            seen: Array<[number, number]> = [],
            shielded = signal(0),
            tracked = signal(0);

        effect(() => {
            calls++;
            seen.push([read(tracked), untrack(() => read(shielded))]);
        });

        expect(calls).toBe(1);
        expect(seen).toEqual([[0, 0]]);

        // Written inside untrack's scope only → no subscription → no re-run
        write(shielded, 5);
        await Promise.resolve();

        expect(calls).toBe(1);

        // Tracked write re-runs and the untracked read reports the current shielded value
        write(tracked, 9);
        await Promise.resolve();

        expect(calls).toBe(2);
        expect(seen[1]).toEqual([9, 5]);
    });

    it('rethrows fn errors and restores the observer so later reads still track', async () => {
        let calls = 0,
            s = signal(0),
            threw = false;

        effect(() => {
            calls++;

            try {
                untrack(() => { throw new Error('untrack boom'); });
            }
            catch (e) {
                threw = (e as Error).message === 'untrack boom';
            }

            read(s);
        });

        expect(threw).toBe(true);
        expect(calls).toBe(1);

        write(s, 1);
        await Promise.resolve();

        // read(s) after the throw still tracked → observer was restored
        expect(calls).toBe(2);
    });

    it('restores the observer when a read inside it throws an errored computed', async () => {
        let calls = 0,
            caught: unknown[] = [],
            s = signal(1),
            t = signal(0);

        let c = computed(() => {
            if (read(s) === 2) {
                throw new Error('c boom');
            }

            return read(s);
        });

        effect(() => read(c), () => {});

        write(s, 2);
        await Promise.resolve();

        effect(() => {
            calls++;

            try {
                untrack(() => read(c));
            }
            catch (e) {
                caught.push(e);
            }

            read(t);
        });

        expect(calls).toBe(1);
        expect(caught.length).toBe(1);
        expect((caught[0] as Error).message).toBe('c boom');

        write(t, 1);
        await Promise.resolve();

        expect(calls).toBe(2);
    });
});


describe('peek', () => {
    it('returns the up-to-date value of a dirty computed before stabilization', async () => {
        let s = signal(2),
            c = computed(() => read(s) * 10);

        // Subscribe so a write marks c dirty
        effect(() => read(c));

        expect(peek(c)).toBe(20);

        write(s, 4);

        // Dirty now, microtask not yet flushed — peek pulls the fresh value, never the stale one
        expect(peek(c)).toBe(40);

        await Promise.resolve();

        expect(peek(c)).toBe(40);
    });

    it('inside an observer returns the fresh value without subscribing the caller', async () => {
        let calls = 0,
            s = signal(1),
            seen: number[] = [],
            c = computed(() => read(s) + 1);

        effect(() => {
            calls++;
            seen.push(peek(c));
        });

        expect(calls).toBe(1);
        expect(seen).toEqual([2]);

        // The peeking effect never subscribed to c (nor to c's source) → no re-run
        write(s, 100);
        await Promise.resolve();

        expect(calls).toBe(1);
        expect(seen).toEqual([2]);
    });

    it('does not add a dependency link to the calling computed', () => {
        let s = signal(3),
            target = computed(() => read(s) + 1);

        let caller = computed(() => peek(target));

        expect(read(caller)).toBe(4);
        expect(caller.deps).toBe(null);
    });

    it('rethrows the cached error of an errored computed', async () => {
        let s = signal(1);

        let c = computed(() => {
            if (read(s) === 2) {
                throw new Error('peek boom');
            }

            return read(s);
        });

        effect(() => read(c), () => {});

        write(s, 2);
        await Promise.resolve();

        expect(() => peek(c)).toThrow('peek boom');
    });

    it('of a signal returns its current value', () => {
        let s = signal(7);

        expect(peek(s)).toBe(7);

        write(s, 8);

        expect(peek(s)).toBe(8);
    });
});

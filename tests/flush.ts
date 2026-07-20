import { describe, expect, it } from 'vitest';
import { batch, effect, flush, read, signal, write } from '~/system';


// Covers spec item flush-batch: sync flush() escape hatch + minimal batch().
// This tree has no implementation of flush()/batch() yet, so these assertions
// are red until the join — a red or an undefined-not-a-function throw is correct.

describe('flush() sync escape hatch', () => {
    describe('clause 1: write -> flush() settles synchronously', () => {
        it('runs the dependent effect synchronously before flush() returns', () => {
            let s = signal(0),
                last = -1,
                runs = 0;

            effect(() => {
                last = read(s);
                runs++;
            });

            expect(runs).toBe(1);

            write(s, 1);

            // Default batching is microtask-only: nothing has settled yet.
            expect(runs).toBe(1);

            flush();

            expect(runs).toBe(2);
            expect(last).toBe(1);
        });

        it('drains the RESCHEDULE tail: a write made inside the effect settles before flush() returns', () => {
            let a = signal(0),
                aRuns = 0,
                b = signal(0),
                bRuns = 0,
                bSeen = -1;

            effect(() => {
                aRuns++;

                let v = read(a);

                if (v > 0) {
                    write(b, v * 10);
                }
            });

            effect(() => {
                bRuns++;
                bSeen = read(b);
            });

            expect(aRuns).toBe(1);
            expect(bRuns).toBe(1);

            write(a, 1);
            flush();

            // The b-effect ran inside the same synchronous flush() call chain.
            expect(bSeen).toBe(10);
            expect(bRuns).toBe(2);
        });
    });


    describe('clause 2: flush() inside a running effect is a safe no-op', () => {
        it('does not re-enter stabilize and subsequent propagation still completes', () => {
            let s = signal(0),
                sRuns = 0,
                t = signal(0),
                tRuns = 0,
                tSeen = -1;

            effect(() => {
                sRuns++;

                let v = read(s);

                if (v > 0) {
                    write(t, v);
                    // Re-entrant flush during stabilization must no-op, not corrupt the heap.
                    flush();
                }
            });

            effect(() => {
                tRuns++;
                tSeen = read(t);
            });

            expect(sRuns).toBe(1);
            expect(tRuns).toBe(1);

            expect(() => {
                write(s, 5);
                flush();
            }).not.toThrow();

            expect(sRuns).toBe(2);
            expect(tSeen).toBe(5);
            expect(tRuns).toBe(2);
        });
    });


    describe('clause 4: previously-queued microtask does not double-run', () => {
        it('the microtask queued by the write no-ops after a manual flush()', async () => {
            let s = signal(0),
                runs = 0;

            effect(() => {
                read(s);
                runs++;
            });

            expect(runs).toBe(1);

            write(s, 1);
            flush();

            expect(runs).toBe(2);

            // The microtask the write already scheduled now fires; heap is empty -> no-op.
            await Promise.resolve();

            expect(runs).toBe(2);
        });
    });
});


describe('batch() minimal transaction', () => {
    describe('clause 3: batched writes produce exactly one re-run', () => {
        it('collapses multiple writes inside fn into one effect re-run after settle', () => {
            let runs = 0,
                s = signal(0),
                seen = -1;

            effect(() => {
                seen = read(s);
                runs++;
            });

            expect(runs).toBe(1);

            batch(() => {
                write(s, 1);
                write(s, 2);
                write(s, 3);
            });

            // Writes deferred while inside batch; nothing settled synchronously yet.
            expect(runs).toBe(1);

            flush();

            expect(runs).toBe(2);
            expect(seen).toBe(3);
        });

        it('returns the value produced by fn', () => {
            let ret = batch(() => 'transaction-result');

            expect(ret).toBe('transaction-result');
        });

        it('restores depth when fn throws so later scheduling still settles', () => {
            let runs = 0,
                s = signal(0),
                seen = -1;

            effect(() => {
                seen = read(s);
                runs++;
            });

            expect(runs).toBe(1);

            expect(() => {
                batch(() => {
                    write(s, 42);
                    throw new Error('boom');
                });
            }).toThrow('boom');

            // If depth were not restored, schedule() would never arm and flush() would no-op.
            flush();

            expect(seen).toBe(42);
            expect(runs).toBe(2);
        });

        it('batch(fn); flush() is a synchronous transaction idiom', () => {
            let runs = 0,
                s = signal(0),
                seen = -1;

            effect(() => {
                seen = read(s);
                runs++;
            });

            batch(() => {
                write(s, 7);
                write(s, 8);
            });
            flush();

            expect(runs).toBe(2);
            expect(seen).toBe(8);
        });
    });
});

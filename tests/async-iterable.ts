// asyncComputed AsyncIterable branch + resolve().
//
// resolve() settle predicate: fn returning `undefined` means "not ready yet, keep
// waiting" (asyncComputed nodes hold undefined pre-first-settle); the first
// non-undefined value resolves the promise; a throw rejects it.
//
// Generator tracking pin: reactive dependencies belong in the factory fn body, read
// synchronously BEFORE returning the iterable — iterator acquisition and the first
// next() run untracked, so reads inside the generator body never link into the
// polling effect.
import { describe, expect, it } from 'vitest';
import { asyncComputed, effect, isPending, read, resolve, root, signal, write } from '~/system';


const tick = () => new Promise((r) => setTimeout(r, 0));


describe('asyncComputed AsyncIterable', () => {
    it('yields land in order; return() fires on re-run', async () => {
        let gates: (() => void)[] = [],
            node!: ReturnType<typeof asyncComputed<number>>,
            returned = 0,
            s = signal(1);

        let gate = () => new Promise<void>((r) => {
            gates.push(r);
        });

        async function* feed() {
            try {
                await gate();
                yield 1;
                await gate();
                yield 2;
                await gate();
            }
            finally {
                returned++;
            }
        }

        root(() => {
            node = asyncComputed(() => {
                read(s);

                return feed();
            });
        });

        expect(gates.length).toBe(1);

        gates[0]();
        await tick();

        expect(read(node)).toBe(1);

        gates[1]();
        await tick();

        expect(read(node)).toBe(2);
        expect(gates.length).toBe(3);

        // Re-run mid-iteration: the old iterator is closed via onCleanup, a fresh one dispatched
        write(s, 2);
        await tick();

        expect(returned).toBe(1);
        expect(gates.length).toBe(4);
    });

    it('return() fires on disposal', async () => {
        let gates: (() => void)[] = [],
            node!: ReturnType<typeof asyncComputed<number>>,
            returned = 0,
            stopRoot!: VoidFunction;

        let gate = () => new Promise<void>((r) => {
            gates.push(r);
        });

        async function* feed() {
            try {
                await gate();
                yield 1;
                await gate();
                yield 2;
            }
            finally {
                returned++;
            }
        }

        root((dispose) => {
            stopRoot = dispose;

            node = asyncComputed(() => feed());
        });

        let keeper = effect(() => {
            read(node);
        });

        gates[0]();
        await tick();

        expect(read(node)).toBe(1);
        expect(gates.length).toBe(2);

        keeper();
        stopRoot();
        await tick();

        expect(returned).toBe(1);

        // The closed iterator yields nothing when its pending gate releases
        gates[1]();
        await tick();

        expect(read(node)).toBe(1);
    });

    it('latest-wins across iterables — a re-run abandons the previous iterator', async () => {
        let gates: (() => void)[] = [],
            node!: ReturnType<typeof asyncComputed<number>>,
            s = signal(1);

        let gate = () => new Promise<void>((r) => {
            gates.push(r);
        });

        async function* feed() {
            await gate();
            yield 1;
            await gate();
            yield 2;
            await gate();
        }

        root(() => {
            node = asyncComputed(() => {
                read(s);

                return feed();
            });
        });

        gates[0]();
        await tick();

        expect(read(node)).toBe(1);

        gates[1]();
        await tick();

        expect(read(node)).toBe(2);
        expect(gates.length).toBe(3);

        write(s, 2);
        await tick();

        expect(gates.length).toBe(4);

        let stale = read(node);

        // Release the OLD iterator's pending gate: its step is stale (id !== v), dropped
        gates[2]();
        await tick();

        expect(read(node)).toBe(stale);
    });

    it('a rejecting step surfaces via the error contract; pending clears', async () => {
        let gates: (() => void)[] = [],
            node!: ReturnType<typeof asyncComputed<number>>;

        let gate = () => new Promise<void>((r) => {
            gates.push(r);
        });

        async function* feed() {
            await gate();
            yield 1;
            await gate();
            throw new Error('iterable boom');
        }

        root(() => {
            node = asyncComputed(() => feed());
        });

        gates[0]();
        await tick();

        expect(read(node)).toBe(1);
        expect(isPending(node)).toBe(true);

        gates[1]();
        await tick();

        expect(isPending(node)).toBe(false);
        expect(() => read(node)).toThrow('iterable boom');
    });

    it('done clears pending; values observed in yield order', async () => {
        let gates: (() => void)[] = [],
            log: number[] = [],
            node!: ReturnType<typeof asyncComputed<number>>;

        let gate = () => new Promise<void>((r) => {
            gates.push(r);
        });

        async function* feed() {
            await gate();
            yield 10;
            await gate();
            yield 20;
        }

        root(() => {
            node = asyncComputed(() => feed());

            effect(() => {
                let v = read(node);

                if (v !== undefined) {
                    log.push(v);
                }
            });
        });

        gates[0]();
        await tick();

        expect(isPending(node)).toBe(true);

        gates[1]();
        await tick();

        expect(isPending(node)).toBe(false);
        expect(log).toEqual([10, 20]);
    });
});


describe('resolve()', () => {
    it('resolves with the first non-undefined value and rejects on throw', async () => {
        let node!: ReturnType<typeof asyncComputed<number>>,
            resolvers: ((v: number) => void)[] = [],
            s = signal(1);

        root(() => {
            node = asyncComputed(() => {
                read(s);

                return new Promise<number>((r) => {
                    resolvers.push(r);
                });
            });
        });

        let p = resolve(() => read(node));

        resolvers[0](42);
        await expect(p).resolves.toBe(42);

        await expect(resolve(() => {
            throw new Error('resolve boom');
        })).rejects.toThrow('resolve boom');
    });

    it('resolve() disposes its internal effect after settling — no further fn runs, teardown is clean', async () => {
        let fnRuns = 0,
            node!: ReturnType<typeof asyncComputed<number>>,
            resolvers: ((v: number) => void)[] = [],
            s = signal(1),
            stopRoot!: VoidFunction;

        root((dispose) => {
            stopRoot = dispose;

            node = asyncComputed(() => {
                read(s);

                return new Promise<number>((r) => {
                    resolvers.push(r);
                });
            });
        });

        let keeper = effect(() => {
            read(node);
        });

        expect(resolvers.length).toBe(1);

        let p = resolve(() => {
            fnRuns++;

            return read(node);
        });

        expect(fnRuns).toBe(1);   // first run sees undefined → keeps waiting

        resolvers[0](7);
        await expect(p).resolves.toBe(7);

        let settleRuns = fnRuns;

        // A dependency change after settling re-dispatches the factory (keeper still
        // subscribes) but must NOT re-run resolve's fn — its internal effect is disposed.
        write(s, 2);
        await new Promise((r) => setTimeout(r, 0));

        expect(resolvers.length).toBe(2);
        expect(fnRuns).toBe(settleRuns);

        resolvers[1](9);
        await new Promise((r) => setTimeout(r, 0));

        expect(read(node)).toBe(9);
        expect(fnRuns).toBe(settleRuns);

        // Clean teardown: keeper then root — the auto-dispose cascade (wrapper →
        // disposal → polling effect) plus the root's second dispose must not throw.
        keeper();
        stopRoot();

        expect(resolvers.length).toBe(2);
    });
});

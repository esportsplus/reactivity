import { describe, expect, it } from 'vitest';
import { asyncComputed, effect, isPending, read, resolve, root, signal, write } from '~/system';


// resolve() settle contract: fn returning undefined means "not ready yet, keep waiting"
// (asyncComputed nodes hold undefined pre-first-settle, so `() => read(wrapper)` composes
// naturally); the first non-undefined value resolves the returned promise, a throw rejects it.
//
// AsyncIterable tracking pin: an async generator's body runs synchronously up to its first
// await/yield INSIDE the factory's first next() call, under the polling effect's observer.
// Dependencies belong in the factory fn body, read synchronously BEFORE the iterable is
// returned — reads inside the generator body itself never link into the polling effect.
function gate(): { promise: Promise<void>; resolve: VoidFunction } {
    let resolveFn!: VoidFunction;

    let promise = new Promise<void>((res) => {
        resolveFn = res;
    });

    return { promise, resolve: resolveFn };
}

function tick(): Promise<void> {
    return new Promise((r) => setTimeout(r, 0));
}


describe('asyncComputed AsyncIterable support', () => {
    it('yields land in order; return() fires on re-run', async () => {
        let allGates: ReturnType<typeof gate>[][] = [],
            calls = 0,
            node!: ReturnType<typeof asyncComputed<number>>,
            returned = 0,
            s = signal(1);

        let feed = () => {
            calls++;

            let myGates = [gate(), gate()];

            allGates.push(myGates);

            return (async function* () {
                try {
                    await myGates[0].promise;
                    yield 1;

                    await myGates[1].promise;
                    yield 2;
                }
                finally {
                    returned++;
                }
            })();
        };

        root(() => {
            node = asyncComputed(() => {
                read(s);

                return feed();
            });
        });

        expect(calls).toBe(1);

        allGates[0][0].resolve();
        await tick();

        expect(read(node)).toBe(1);

        // Mid-iteration: generation 0's generator is suspended awaiting its second gate.
        // Re-run the factory before releasing it — the old iterator is abandoned.
        write(s, 2);
        await tick();

        expect(calls).toBe(2);

        // The abandoned generation-0 generator only unwinds once its own pending internal
        // await settles (async generator return() semantics) — release it to observe close.
        allGates[0][1].resolve();
        await tick();

        expect(returned).toBe(1);
    });

    it('return() fires on disposal', async () => {
        let allGates: ReturnType<typeof gate>[][] = [],
            node!: ReturnType<typeof asyncComputed<number>>,
            returned = 0,
            s = signal(1),
            stopRoot!: VoidFunction;

        let feed = () => {
            let myGates = [gate(), gate()];

            allGates.push(myGates);

            return (async function* () {
                try {
                    await myGates[0].promise;
                    yield 1;

                    await myGates[1].promise;
                    yield 2;
                }
                finally {
                    returned++;
                }
            })();
        };

        root((dispose) => {
            stopRoot = dispose;

            node = asyncComputed(() => {
                read(s);

                return feed();
            });
        });

        let keeper = effect(() => {
            read(node);
        });

        allGates[0][0].resolve();
        await tick();

        expect(read(node)).toBe(1);

        // Mid-iteration: dispose while the generator is suspended awaiting its second gate.
        keeper();
        stopRoot();

        allGates[0][1].resolve();
        await tick();

        expect(returned).toBe(1);
        expect(read(node)).toBe(1);   // no further value landed
    });

    it('latest-wins across iterables: a stale yield from an abandoned iterator never lands', async () => {
        let allGates: ReturnType<typeof gate>[][] = [],
            calls = 0,
            node!: ReturnType<typeof asyncComputed<number>>,
            s = signal(1);

        let feed = () => {
            calls++;

            let generation = calls,
                myGates = [gate(), gate()];

            allGates.push(myGates);

            return (async function* () {
                await myGates[0].promise;
                yield generation * 100;

                await myGates[1].promise;
                yield generation * 100 + 1;
            })();
        };

        root(() => {
            node = asyncComputed(() => {
                read(s);

                return feed();
            });
        });

        allGates[0][0].resolve();
        await tick();

        expect(read(node)).toBe(100);

        // Re-run before releasing generation 0's second gate — it becomes abandoned.
        write(s, 2);
        await tick();

        expect(calls).toBe(2);

        // Release the abandoned generation's pending gate: its stale second yield (101)
        // reaches step(), but the id !== v guard drops it before it ever touches node.
        allGates[0][1].resolve();
        await tick();

        expect(read(node)).toBe(100);

        // The fresh iterator still works normally.
        allGates[1][0].resolve();
        await tick();

        expect(read(node)).toBe(200);
    });

    it('a rejecting iterator step surfaces via the error contract', async () => {
        let node!: ReturnType<typeof asyncComputed<number>>,
            rejectGate = gate();

        let feed = async function* () {
            yield 1;

            await rejectGate.promise;
            throw new Error('iterable step boom');
        };

        root(() => {
            node = asyncComputed(() => feed());
        });

        await tick();

        expect(read(node)).toBe(1);
        expect(isPending(node)).toBe(true);

        rejectGate.resolve();
        await tick();

        expect(isPending(node)).toBe(false);
        expect(() => read(node)).toThrow('iterable step boom');
    });

    it('done clears pending only after the generator completes; values land in yield order', async () => {
        let gates = [gate(), gate()],
            node!: ReturnType<typeof asyncComputed<number>>,
            pendingStates: boolean[] = [],
            values: (number | undefined)[] = [];

        let feed = async function* () {
            await gates[0].promise;
            yield 1;

            await gates[1].promise;
            yield 2;
        };

        root(() => {
            node = asyncComputed(() => feed());

            effect(() => {
                values.push(read(node));
                pendingStates.push(isPending(node));
            });
        });

        expect(values).toEqual([undefined]);
        expect(pendingStates).toEqual([true]);

        gates[0].resolve();
        await tick();

        expect(values).toEqual([undefined, 1]);
        expect(pendingStates).toEqual([true, true]);

        gates[1].resolve();
        await tick();

        expect(values).toEqual([undefined, 1, 2, 2]);
        expect(pendingStates).toEqual([true, true, true, false]);
    });
});


describe('resolve()', () => {
    it('resolves with the first non-undefined settle of a tracked asyncComputed', async () => {
        let node!: ReturnType<typeof asyncComputed<number>>,
            resolvers: ((v: number) => void)[] = [];

        root(() => {
            node = asyncComputed(() => new Promise<number>((r) => {
                resolvers.push(r);
            }));
        });

        let p = resolve(() => read(node));

        expect(resolvers.length).toBe(1);

        resolvers[0](42);

        await expect(p).resolves.toBe(42);
    });

    it('rejects when the tracked expression throws', async () => {
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

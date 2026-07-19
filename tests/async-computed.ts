import { describe, expect, it } from 'vitest';
import { asyncComputed, dispose, effect, isComputed, isSignal, read, root, signal, write } from '~/system';


describe('asyncComputed', () => {
    it('initial value is undefined', () => {
        root(() => {
            let node = asyncComputed(() => Promise.resolve(42));

            expect(read(node)).toBeUndefined();
        });
    });

    it('returns a computed, not a signal', () => {
        root(() => {
            let node = asyncComputed(() => Promise.resolve(42));

            expect(isComputed(node)).toBe(true);
            expect(isSignal(node)).toBe(false);
        });
    });

    it('resolves to correct value', async () => {
        let node!: ReturnType<typeof asyncComputed<number>>;

        root(() => {
            node = asyncComputed(() => Promise.resolve(42));
        });

        await new Promise((r) => setTimeout(r, 10));

        expect(read(node)).toBe(42);
    });

    it('updates when dependency changes', async () => {
        let node!: ReturnType<typeof asyncComputed<string>>,
            s = signal('hello');

        root(() => {
            node = asyncComputed(() => Promise.resolve(read(s)));
        });

        await new Promise((r) => setTimeout(r, 10));

        expect(read(node)).toBe('hello');

        write(s, 'world');
        await new Promise((r) => setTimeout(r, 10));

        expect(read(node)).toBe('world');
    });

    it('race condition — rapid changes, only latest promise writes', async () => {
        let node!: ReturnType<typeof asyncComputed<number>>,
            resolvers: ((v: number) => void)[] = [],
            s = signal(1);

        root(() => {
            node = asyncComputed(() => {
                read(s);
                return new Promise<number>((resolve) => {
                    resolvers.push(resolve);
                });
            });
        });

        expect(read(node)).toBeUndefined();

        write(s, 2);
        await Promise.resolve();
        await Promise.resolve();

        write(s, 3);
        await Promise.resolve();
        await Promise.resolve();

        // Resolve first (stale)
        resolvers[0](100);
        await Promise.resolve();

        expect(read(node)).toBeUndefined();

        // Resolve second (stale)
        resolvers[1](200);
        await Promise.resolve();

        expect(read(node)).toBeUndefined();

        // Resolve latest — value lands after the stabilize microtask
        resolvers[2](300);
        await new Promise((r) => setTimeout(r, 0));

        expect(read(node)).toBe(300);
    });

    it('dirty-gap: a rejection settling after a re-dirty is dropped', async () => {
        let node!: ReturnType<typeof asyncComputed<number>>,
            rejecters: ((e: Error) => void)[] = [],
            resolvers: ((v: number) => void)[] = [],
            s = signal(1);

        root(() => {
            node = asyncComputed(() => {
                read(s);

                return new Promise<number>((resolve, reject) => {
                    rejecters.push(reject);
                    resolvers.push(resolve);
                });
            });
        });

        // Queue the rejection FIRST, then dirty the factory — it settles in the gap
        rejecters[0](new Error('gap rejection'));
        write(s, 2);

        await new Promise((r) => setTimeout(r, 0));

        // Dropped: the wrapper is not poisoned by the superseded rejection
        expect(read(node)).toBeUndefined();

        resolvers[1](7);
        await new Promise((r) => setTimeout(r, 0));

        expect(read(node)).toBe(7);
    });

    it('onCleanup works for abort controller', async () => {
        let aborted = false,
            s = signal(1);

        root(() => {
            asyncComputed((onCleanup) => {
                let controller = new AbortController();

                controller.signal.addEventListener('abort', () => {
                    aborted = true;
                });

                onCleanup(() => controller.abort());

                return Promise.resolve(read(s));
            });
        });

        await new Promise((r) => setTimeout(r, 10));

        expect(aborted).toBe(false);

        write(s, 2);
        await new Promise((r) => setTimeout(r, 10));

        expect(aborted).toBe(true);
    });

    it('effect tracks async computed', async () => {
        let node!: ReturnType<typeof asyncComputed<number>>,
            s = signal(10),
            values: (number | undefined)[] = [];

        root(() => {
            node = asyncComputed(() => Promise.resolve(read(s)));

            effect(() => {
                values.push(read(node));
            });
        });

        expect(values).toEqual([undefined]);

        await new Promise((r) => setTimeout(r, 10));

        expect(values).toEqual([undefined, 10]);

        write(s, 20);
        await new Promise((r) => setTimeout(r, 10));

        expect(values).toEqual([undefined, 10, 20]);
    });

    it('dispose stops updates', async () => {
        let node!: ReturnType<typeof asyncComputed<number>>,
            s = signal(1);

        let disposeRoot!: VoidFunction;

        root((dispose) => {
            disposeRoot = dispose;
            node = asyncComputed(() => Promise.resolve(read(s)));
        });

        await new Promise((r) => setTimeout(r, 10));

        expect(read(node)).toBe(1);

        disposeRoot();

        write(s, 2);
        await new Promise((r) => setTimeout(r, 10));

        expect(read(node)).toBe(1);
    });

    it('nested asyncComputed — B depends on A', async () => {
        let s = signal(5),
            nodeA!: ReturnType<typeof asyncComputed<number>>,
            nodeB!: ReturnType<typeof asyncComputed<number>>;

        root(() => {
            nodeA = asyncComputed(() => Promise.resolve(read(s) * 2));

            nodeB = asyncComputed(() => {
                let a = read(nodeA);

                if (a === undefined) {
                    return Promise.resolve(0);
                }

                return Promise.resolve(a + 100);
            });
        });

        // Initially both undefined
        expect(read(nodeA)).toBeUndefined();
        expect(read(nodeB)).toBeUndefined();

        // Wait for A to resolve
        await new Promise((r) => setTimeout(r, 10));

        expect(read(nodeA)).toBe(10);

        // Wait for B to react to A's resolved value
        await new Promise((r) => setTimeout(r, 10));

        expect(read(nodeB)).toBe(110);

        // Update source signal — A and B should both update
        write(s, 20);
        await new Promise((r) => setTimeout(r, 20));

        expect(read(nodeA)).toBe(40);

        await new Promise((r) => setTimeout(r, 10));

        expect(read(nodeB)).toBe(140);
    });

    it('rejected promise rethrows at read and recovers on the next resolve', async () => {
        let node!: ReturnType<typeof asyncComputed<number>>,
            s = signal(1);

        root(() => {
            node = asyncComputed(() => {
                let v = read(s);

                if (v === 2) {
                    return Promise.reject(new Error('fail'));
                }

                return Promise.resolve(v);
            });
        });

        await new Promise((r) => setTimeout(r, 10));

        expect(read(node)).toBe(1);

        write(s, 2);
        await new Promise((r) => setTimeout(r, 10));

        expect(() => read(node)).toThrow('fail');

        write(s, 3);
        await new Promise((r) => setTimeout(r, 10));

        // Recovers after a non-rejected promise
        expect(read(node)).toBe(3);
    });

    it('disposing the returned computed stops the polling effect and the factory', async () => {
        let calls = 0,
            s = signal(1);

        // Created OUTSIDE any root — ownership rides the returned computed alone
        let node = asyncComputed(() => {
            calls++;

            return Promise.resolve(read(s));
        });

        await new Promise((r) => setTimeout(r, 10));

        expect(read(node)).toBe(1);
        expect(calls).toBe(1);

        dispose(node);

        write(s, 2);
        await new Promise((r) => setTimeout(r, 10));

        // No further dispatches or writes land after dispose
        expect(calls).toBe(1);
        expect(read(node)).toBe(1);
    });
});

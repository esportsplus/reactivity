import { describe, expect, it } from 'vitest';
import { computed, dispose, effect, isComputed, isSignal, read, root, signal, write } from '~/system';
import { tick, waitFor } from './lib/wait-for';
import type { Computed } from '~/system';


describe('asyncComputed', () => {
    it('initial value is undefined', () => {
        root(() => {
            let node = computed(() => Promise.resolve(42));

            expect(read(node)).toBeUndefined();
        });
    });

    it('returns a computed, not a signal', () => {
        root(() => {
            let node = computed(() => Promise.resolve(42));

            expect(isComputed(node)).toBe(true);
            expect(isSignal(node)).toBe(false);
        });
    });

    it('resolves to correct value', async () => {
        let node!: Computed<number | undefined>;

        root(() => {
            node = computed(() => Promise.resolve(42));
        });

        await waitFor(() => read(node) === 42, 'node resolves to 42');

        expect(read(node)).toBe(42);
    });

    it('updates when dependency changes', async () => {
        let node!: Computed<string | undefined>,
            s = signal('hello');

        root(() => {
            node = computed(() => Promise.resolve(read(s)));
        });

        await waitFor(() => read(node) === 'hello', 'node resolves to hello');

        expect(read(node)).toBe('hello');

        write(s, 'world');
        await waitFor(() => read(node) === 'world', 'node updates to world');

        expect(read(node)).toBe('world');
    });

    it('race condition — rapid changes, only latest promise writes', async () => {
        let node!: Computed<number | undefined>,
            resolvers: ((v: number) => void)[] = [],
            s = signal(1);

        root(() => {
            node = computed(() => {
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
        await waitFor(() => read(node) === 300, 'node resolves to latest 300');

        expect(read(node)).toBe(300);
    });

    it('dirty-gap: a rejection settling after a re-dirty is dropped', async () => {
        let node!: Computed<number | undefined>,
            rejecters: ((e: Error) => void)[] = [],
            resolvers: ((v: number) => void)[] = [],
            s = signal(1);

        root(() => {
            node = computed(() => {
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

        await tick();

        // Dropped: the wrapper is not poisoned by the superseded rejection
        expect(read(node)).toBeUndefined();

        resolvers[1](7);
        await waitFor(() => read(node) === 7, 'node resolves to 7');

        expect(read(node)).toBe(7);
    });

    it('onCleanup works for abort controller', async () => {
        let aborted = false,
            s = signal(1);

        root(() => {
            computed((onCleanup) => {
                let controller = new AbortController();

                controller.signal.addEventListener('abort', () => {
                    aborted = true;
                });

                onCleanup(() => controller.abort());

                return Promise.resolve(read(s));
            });
        });

        await tick();

        expect(aborted).toBe(false);

        write(s, 2);
        await waitFor(() => aborted === true, 'controller aborts on re-run');

        expect(aborted).toBe(true);
    });

    it('effect tracks async computed', async () => {
        let node!: Computed<number | undefined>,
            s = signal(10),
            values: (number | undefined)[] = [];

        root(() => {
            node = computed(() => Promise.resolve(read(s)));

            effect(() => {
                values.push(read(node));
            });
        });

        expect(values).toEqual([undefined]);

        await waitFor(() => values.length === 2, 'effect observes resolved 10');

        expect(values).toEqual([undefined, 10]);

        write(s, 20);
        await waitFor(() => values.length === 3, 'effect observes updated 20');

        expect(values).toEqual([undefined, 10, 20]);
    });

    it('dispose stops updates', async () => {
        let node!: Computed<number | undefined>,
            s = signal(1);

        let disposeRoot!: VoidFunction;

        root((dispose) => {
            disposeRoot = dispose;
            node = computed(() => Promise.resolve(read(s)));
        });

        await waitFor(() => read(node) === 1, 'node resolves to 1');

        expect(read(node)).toBe(1);

        disposeRoot();

        write(s, 2);
        await tick();

        expect(read(node)).toBe(1);
    });

    it('nested asyncComputed — B depends on A', async () => {
        let s = signal(5),
            nodeA!: Computed<number | undefined>,
            nodeB!: Computed<number | undefined>;

        root(() => {
            nodeA = computed(() => Promise.resolve(read(s) * 2));

            nodeB = computed(() => {
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
        await waitFor(() => read(nodeA) === 10, 'nodeA resolves to 10');

        expect(read(nodeA)).toBe(10);

        // Wait for B to react to A's resolved value
        await waitFor(() => read(nodeB) === 110, 'nodeB resolves to 110');

        expect(read(nodeB)).toBe(110);

        // Update source signal — A and B should both update
        write(s, 20);
        await waitFor(() => read(nodeA) === 40, 'nodeA updates to 40');

        expect(read(nodeA)).toBe(40);

        await waitFor(() => read(nodeB) === 140, 'nodeB updates to 140');

        expect(read(nodeB)).toBe(140);
    });

    it('rejected promise rethrows at read and recovers on the next resolve', async () => {
        let node!: Computed<number | undefined>,
            s = signal(1);

        root(() => {
            node = computed(() => {
                let v = read(s);

                if (v === 2) {
                    return Promise.reject(new Error('fail'));
                }

                return Promise.resolve(v);
            });
        });

        await waitFor(() => read(node) === 1, 'node resolves to 1');

        expect(read(node)).toBe(1);

        write(s, 2);
        await waitFor(() => {
            try {
                read(node);

                return false;
            }
            catch (e) {
                return (e as Error).message === 'fail';
            }
        }, 'node read throws fail');

        expect(() => read(node)).toThrow('fail');

        write(s, 3);
        await waitFor(() => {
            try {
                return read(node) === 3;
            }
            catch {
                return false;
            }
        }, 'node recovers to 3');

        // Recovers after a non-rejected promise
        expect(read(node)).toBe(3);
    });

    it('disposing the returned computed stops the polling effect and the factory', async () => {
        let calls = 0,
            s = signal(1);

        // Created OUTSIDE any root — ownership rides the returned computed alone
        let node = computed(() => {
            calls++;

            return Promise.resolve(read(s));
        });

        await waitFor(() => read(node) === 1, 'node resolves to 1');

        expect(read(node)).toBe(1);
        expect(calls).toBe(1);

        dispose(node);

        write(s, 2);
        await tick();

        // No further dispatches or writes land after dispose
        expect(calls).toBe(1);
        expect(read(node)).toBe(1);
    });
});

import { describe, expect, it } from 'vitest';
import { asyncComputed, computed, effect, isPending, read, root, signal, write } from '~/system';


describe('asyncComputed dirty-gap guard', () => {
    it('drops a settle landing after the factory is re-dirtied but before its re-run', async () => {
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

        expect(resolvers.length).toBe(1);

        // Queue the settle FIRST, then dirty the factory: the settle microtask runs
        // before the stabilize re-run, so id === v still passes — the dirty-gap.
        resolvers[0](100);
        write(s, 2);

        await new Promise((r) => setTimeout(r, 0));

        // The stale value never landed; the re-run dispatched a fresh promise
        expect(resolvers.length).toBe(2);
        expect(read(node)).toBeUndefined();

        resolvers[1](200);
        await new Promise((r) => setTimeout(r, 0));

        expect(read(node)).toBe(200);
    });
});


describe('isPending', () => {
    it('true between dispatch and settle, false after resolve and reject', async () => {
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

        expect(isPending(node)).toBe(true);

        resolvers[0](1);
        await new Promise((r) => setTimeout(r, 0));

        expect(isPending(node)).toBe(false);

        write(s, 2);
        await Promise.resolve();
        await Promise.resolve();

        expect(isPending(node)).toBe(true);

        rejecters[1](new Error('reject settle'));
        await new Promise((r) => setTimeout(r, 0));

        expect(isPending(node)).toBe(false);
        expect(() => read(node)).toThrow('reject settle');
    });

    it('false for non-async computeds', () => {
        let c = computed(() => 1);

        expect(isPending(c)).toBe(false);
    });

    it('effects tracking isPending re-run on transitions', async () => {
        let node!: ReturnType<typeof asyncComputed<number>>,
            resolvers: ((v: number) => void)[] = [],
            states: boolean[] = [];

        root(() => {
            node = asyncComputed(() => new Promise<number>((resolve) => {
                resolvers.push(resolve);
            }));

            effect(() => {
                states.push(isPending(node));
            });
        });

        expect(states).toEqual([true]);

        resolvers[0](1);
        await new Promise((r) => setTimeout(r, 0));

        expect(states).toEqual([true, false]);
    });

    it('a superseded settle does not clear a newer dispatch pending', async () => {
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

        write(s, 2);
        await Promise.resolve();
        await Promise.resolve();

        expect(resolvers.length).toBe(2);

        // Superseded settle: dropped, and pending stays true for the newer dispatch
        resolvers[0](111);
        await new Promise((r) => setTimeout(r, 0));

        expect(isPending(node)).toBe(true);
        expect(read(node)).toBeUndefined();

        resolvers[1](222);
        await new Promise((r) => setTimeout(r, 0));

        expect(isPending(node)).toBe(false);
        expect(read(node)).toBe(222);
    });
});


describe('asyncComputed outside root', () => {
    it('stops polling after its last subscriber unlinks', async () => {
        let calls = 0,
            s = signal(1);

        let node = asyncComputed(() => {
            calls++;

            return Promise.resolve(read(s));
        });

        let stop = effect(() => {
            read(node);
        });

        await new Promise((r) => setTimeout(r, 10));

        expect(read(node)).toBe(1);
        expect(calls).toBe(1);

        stop();

        write(s, 2);
        await new Promise((r) => setTimeout(r, 10));

        // Wrapper auto-disposed through unlink — effect and factory torn down, no new dispatch
        expect(calls).toBe(1);
        expect(read(node)).toBe(1);
    });
});

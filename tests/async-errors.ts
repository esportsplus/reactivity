import { describe, expect, it } from 'vitest';
import { asyncComputed, read, root, signal, write } from '~/system';


describe('asyncComputed error propagation', () => {
    it('rejection rethrows at read and a later success clears it', async () => {
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
        expect(() => read(node)).toThrow('fail');

        write(s, 3);
        await new Promise((r) => setTimeout(r, 10));

        expect(read(node)).toBe(3);
    });

    it('latest-wins: a stale rejection is discarded', async () => {
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

        write(s, 2);
        await Promise.resolve();
        await Promise.resolve();

        expect(rejecters.length).toBe(2);

        // Reject the first (superseded) dispatch — must be discarded
        rejecters[0](new Error('stale'));
        await new Promise((r) => setTimeout(r, 0));

        expect(read(node)).toBeUndefined();

        // The latest dispatch still lands
        resolvers[1](42);
        await new Promise((r) => setTimeout(r, 0));

        expect(read(node)).toBe(42);
    });

    it('stale-while-revalidate keeps the prior value readable during a refetch', async () => {
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

        resolvers[0](10);
        await new Promise((r) => setTimeout(r, 0));

        expect(read(node)).toBe(10);

        write(s, 2);
        await Promise.resolve();
        await Promise.resolve();

        // Refetch dispatched but unresolved — prior value stays readable
        expect(resolvers.length).toBe(2);
        expect(read(node)).toBe(10);

        resolvers[1](20);
        await new Promise((r) => setTimeout(r, 0));

        expect(read(node)).toBe(20);
    });

    it('undefined rejection reason surfaces as a real Error', async () => {
        let node!: ReturnType<typeof asyncComputed<number>>;

        root(() => {
            node = asyncComputed(() => Promise.reject(undefined));
        });

        await new Promise((r) => setTimeout(r, 10));

        expect(() => read(node)).toThrow('reactivity: asyncComputed rejected with undefined');
    });
});

import { describe, expect, it } from 'vitest';
import { computed, read, root, signal, write } from '~/system';
import { tick, waitFor } from './lib/wait-for';
import type { Computed } from '~/system';


describe('asyncComputed error propagation', () => {
    it('rejection rethrows at read and a later success clears it', async () => {
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

        expect(read(node)).toBe(3);
    });

    it('latest-wins: a stale rejection is discarded', async () => {
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

        write(s, 2);
        await Promise.resolve();
        await Promise.resolve();

        expect(rejecters.length).toBe(2);

        // Reject the first (superseded) dispatch — must be discarded
        rejecters[0](new Error('stale'));
        await tick();

        expect(read(node)).toBeUndefined();

        // The latest dispatch still lands
        resolvers[1](42);
        await waitFor(() => read(node) === 42, 'latest resolves to 42');

        expect(read(node)).toBe(42);
    });

    it('stale-while-revalidate keeps the prior value readable during a refetch', async () => {
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

        resolvers[0](10);
        await waitFor(() => read(node) === 10, 'node resolves to 10');

        expect(read(node)).toBe(10);

        write(s, 2);
        await Promise.resolve();
        await Promise.resolve();

        // Refetch dispatched but unresolved — prior value stays readable
        expect(resolvers.length).toBe(2);
        expect(read(node)).toBe(10);

        resolvers[1](20);
        await waitFor(() => read(node) === 20, 'node refetches to 20');

        expect(read(node)).toBe(20);
    });

    it('undefined rejection reason surfaces as a real Error', async () => {
        let node!: Computed<number | undefined>;

        root(() => {
            node = computed(() => Promise.reject(undefined));
        });

        await waitFor(() => {
            try {
                read(node);

                return false;
            }
            catch {
                return true;
            }
        }, 'node read throws');

        expect(() => read(node)).toThrow('reactivity: async computed rejected with undefined');
    });
});

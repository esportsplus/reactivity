import { describe, expect, it } from 'vitest';
import { computed, effect, read, root, signal, write } from '~/system';
import { tick, waitFor } from './lib/wait-for';
import type { Computed } from '~/system';


describe('asyncComputed dirty-gap guard', () => {
    it('drops a settle landing after the factory is re-dirtied but before its re-run', async () => {
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

        expect(resolvers.length).toBe(1);

        // Queue the settle FIRST, then dirty the factory: the settle microtask runs
        // before the stabilize re-run, so id === v still passes — the dirty-gap.
        resolvers[0](100);
        write(s, 2);

        await waitFor(() => resolvers.length === 2, 're-run dispatches a fresh promise');

        // The stale value never landed; the re-run dispatched a fresh promise
        expect(resolvers.length).toBe(2);
        expect(read(node)).toBeUndefined();

        resolvers[1](200);
        await waitFor(() => read(node) === 200, 'node resolves to 200');

        expect(read(node)).toBe(200);
    });
});


describe('asyncComputed outside root', () => {
    it('stops polling after its last subscriber unlinks', async () => {
        let calls = 0,
            s = signal(1);

        let node = computed(() => {
            calls++;

            return Promise.resolve(read(s));
        });

        let stop = effect(() => {
            read(node);
        });

        await waitFor(() => read(node) === 1, 'node resolves to 1');

        expect(read(node)).toBe(1);
        expect(calls).toBe(1);

        stop();

        write(s, 2);
        await tick();

        // Wrapper auto-disposed through unlink — effect and factory torn down, no new dispatch
        expect(calls).toBe(1);
        expect(read(node)).toBe(1);
    });
});

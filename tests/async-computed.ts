import { describe, expect, it } from 'vitest';
import { asyncComputed, effect, read, root, signal, write } from '~/system';


describe('asyncComputed', () => {
    it('initial value is undefined', () => {
        root(() => {
            let node = asyncComputed(() => Promise.resolve(42));

            expect(read(node)).toBeUndefined();
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

        // Resolve latest
        resolvers[2](300);
        await Promise.resolve();

        expect(read(node)).toBe(300);
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

    it('rejected promise does not crash and retains previous value', async () => {
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

        // Value should remain 1 after rejection
        expect(read(node)).toBe(1);

        write(s, 3);
        await new Promise((r) => setTimeout(r, 10));

        // Resumes after non-rejected promise
        expect(read(node)).toBe(3);
    });
});

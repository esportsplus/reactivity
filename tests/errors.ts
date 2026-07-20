import { describe, expect, it } from 'vitest';
import { computed, effect, read, signal, write } from '~/system';
import { tick } from './lib/wait-for';


async function captureUncaught(run: () => void | Promise<void>): Promise<unknown[]> {
    let captured: unknown[] = [],
        listeners = process.listeners('uncaughtException');

    process.removeAllListeners('uncaughtException');
    process.on('uncaughtException', capture);

    function capture(e: unknown) {
        captured.push(e);
    }

    try {
        await run();
        await tick();
    }
    finally {
        process.removeListener('uncaughtException', capture);

        for (let i = 0, n = listeners.length; i < n; i++) {
            process.on('uncaughtException', listeners[i]);
        }
    }

    return captured;
}


describe('computed error caching', () => {
    it('caches the error and rethrows at read without re-running fn', async () => {
        let calls = 0,
            s = signal(1),
            c = computed(() => {
                calls++;

                if (read(s) % 2 !== 0) {
                    throw new Error('odd');
                }

                return read(s);
            });

        expect(() => read(c)).toThrow('odd');
        expect(calls).toBe(1);

        expect(() => read(c)).toThrow('odd');
        expect(() => read(c)).toThrow('odd');
        expect(calls).toBe(1);

        write(s, 2);
        await Promise.resolve();

        expect(read(c)).toBe(2);
        expect(calls).toBe(2);
    });

    it('rethrows the exact error instance', () => {
        let error = new Error('boom'),
            c = computed(() => {
                throw error;
            });

        try {
            read(c);
            expect.unreachable();
        }
        catch (e) {
            expect(e).toBe(error);
        }
    });

    it('propagates through a computed chain', async () => {
        let s = signal(1),
            c1 = computed(() => {
                if (read(s) % 2 !== 0) {
                    throw new Error('odd');
                }

                return read(s);
            }),
            c2 = computed(() => read(c1)),
            c3 = computed(() => read(c2));

        expect(() => read(c3)).toThrow('odd');

        write(s, 2);
        await Promise.resolve();

        expect(read(c3)).toBe(2);
    });

    it('error to success with unchanged value still wakes dependents', async () => {
        let s = signal(0),
            c1 = computed(() => {
                if (read(s) % 2 !== 0) {
                    throw new Error('odd');
                }

                return 10;
            }),
            c2 = computed(() => read(c1));

        expect(read(c2)).toBe(10);

        write(s, 1);
        await Promise.resolve();

        expect(() => read(c2)).toThrow('odd');

        write(s, 2);
        await Promise.resolve();

        expect(read(c2)).toBe(10);
    });
});


describe('effect error contract', () => {
    it('effect without onError rethrows via microtask on first-run failure', async () => {
        let captured = await captureUncaught(() => {
            effect(() => {
                throw new Error('first run boom');
            });
        });

        expect(captured.length).toBe(1);
        expect((captured[0] as Error).message).toBe('first run boom');
    });

    it('effect without onError rethrows via microtask on dependency-triggered failure', async () => {
        let s = signal(0),
            stop = effect(() => {
                if (read(s) === 1) {
                    throw new Error('effect boom');
                }
            });

        let captured = await captureUncaught(() => {
            write(s, 1);
        });

        expect(captured.length).toBe(1);
        expect((captured[0] as Error).message).toBe('effect boom');

        stop();
    });

    it('effect rethrows on every failure, not just the first', async () => {
        let s = signal(0),
            stop = effect(() => {
                let val = read(s);

                if (val % 2 !== 0) {
                    throw new Error(`boom ${val}`);
                }
            });

        let captured = await captureUncaught(async () => {
            write(s, 1);
            await tick();
            write(s, 2);
            await tick();
            write(s, 3);
        });

        expect(captured.length).toBe(2);
        expect((captured[0] as Error).message).toBe('boom 1');
        expect((captured[1] as Error).message).toBe('boom 3');

        stop();
    });

    it('effect onError receives the error and nothing rethrows', async () => {
        let errors: unknown[] = [],
            s = signal(0),
            stop = effect(
                () => {
                    if (read(s) === 1) {
                        throw new Error('handled');
                    }
                },
                (e) => {
                    errors.push(e);
                }
            );

        let captured = await captureUncaught(() => {
            write(s, 1);
        });

        expect(captured.length).toBe(0);
        expect(errors.length).toBe(1);
        expect((errors[0] as Error).message).toBe('handled');

        stop();
    });
});

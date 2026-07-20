import { describe, expect, it } from 'vitest';
import { asyncComputed, computed, effect, onUnobserved, read, signal } from '~/system';


// The AbortController recipe wires cancellation ONLY through onUnobserved so a passing assert
// proves the hook fired; production code would pair it with onCleanup as well.
describe('onUnobserved()', () => {
    it('fires exactly once when the last subscriber of a signal unlinks', () => {
        let fired = 0,
            s = signal(1);

        onUnobserved(s, () => fired++);

        let stop = effect(() => {
            read(s);
        });

        expect(fired).toBe(0);

        stop();

        expect(fired).toBe(1);
    });

    it('does not fire on intermediate unsubscribes (2 subs -> 1)', () => {
        let fired = 0,
            s = signal(1);

        onUnobserved(s, () => fired++);

        let stop1 = effect(() => read(s)),
            stop2 = effect(() => read(s));

        stop1();

        expect(fired).toBe(0);

        stop2();

        expect(fired).toBe(1);
    });

    it('refires after re-subscribe then re-unsubscribe (registration is not one-shot)', () => {
        let fired = 0,
            s = signal(1);

        onUnobserved(s, () => fired++);

        let stop1 = effect(() => read(s));

        stop1();

        expect(fired).toBe(1);

        let stop2 = effect(() => read(s));

        stop2();

        expect(fired).toBe(2);
    });

    it('fires on a computed last-unsub after the auto-dispose cleanup, in order', () => {
        let log: string[] = [],
            s = signal(1);

        let c = computed((onCleanup) => {
            onCleanup(() => log.push('cleanup'));

            return read(s);
        });

        onUnobserved(c, () => log.push('unobserved'));

        let stop = effect(() => {
            read(c);
        });

        stop();

        expect(log).toEqual(['cleanup', 'unobserved']);
    });

    it('the unregister function prevents firing; unregistering one of two leaves the other', () => {
        let a = 0,
            b = 0,
            s = signal(1);

        let offA = onUnobserved(s, () => a++);

        onUnobserved(s, () => b++);

        offA();

        let stop = effect(() => read(s));

        stop();

        expect(a).toBe(0);
        expect(b).toBe(1);
    });

    it('the AbortController recipe cancels in-flight work on last-unsub', async () => {
        let aborted = false,
            controller: AbortController | undefined;

        let node = asyncComputed(() => {
            controller = new AbortController();
            controller.signal.addEventListener('abort', () => {
                aborted = true;
            });

            return new Promise<number>(() => {});
        });

        onUnobserved(node, () => controller?.abort());

        let stop = effect(() => {
            read(node);
        });

        await new Promise((r) => setTimeout(r, 0));

        expect(aborted).toBe(false);

        stop();

        expect(aborted).toBe(true);
    });
});

import { describe, expect, it } from 'vitest';
import { computed, dispose, effect, flush, owner, pause, read, resume, root, signal, write } from '~/system';
import type { Computed } from '~/system';


function counter(s: ReturnType<typeof signal<number>>) {
    let state = { node: null as unknown as Computed<unknown>, runs: 0 };

    state.node = effect(() => {
        read(s);
        state.runs++;
    });

    return state;
}


describe('pause / resume', () => {
    it('a paused effect does not run on write', () => {
        let s = signal(0),
            c = counter(s);

        pause(c.node);
        write(s, 1);
        flush();
        write(s, 2);
        flush();

        expect(c.runs).toBe(1);
        dispose(c.node);
    });

    it('resuming after writes runs it exactly once', () => {
        let s = signal(0),
            c = counter(s);

        pause(c.node);
        write(s, 1);
        flush();
        write(s, 2);
        flush();
        resume(c.node);
        flush();

        expect(c.runs).toBe(2);

        flush();
        expect(c.runs).toBe(2);

        write(s, 3);
        flush();
        expect(c.runs).toBe(3);
        dispose(c.node);
    });

    it('resume schedules the replay without a flush', async () => {
        let s = signal(0),
            c = counter(s);

        pause(c.node);
        write(s, 1);
        await Promise.resolve();
        resume(c.node);

        expect(c.runs).toBe(1);

        await Promise.resolve();
        expect(c.runs).toBe(2);
        dispose(c.node);
    });

    it('resuming without a write runs nothing', () => {
        let other = signal(0),
            s = signal(0),
            c = counter(s),
            o = counter(other);

        pause(c.node);
        flush();
        resume(c.node);
        flush();
        write(other, 1);
        flush();

        expect(c.runs).toBe(1);
        expect(o.runs).toBe(2);
        dispose(c.node);
        dispose(o.node);
    });

    it('pause and resume are idempotent', () => {
        let s = signal(0),
            c = counter(s);

        pause(c.node);
        pause(c.node);
        write(s, 1);
        flush();
        resume(c.node);
        resume(c.node);
        flush();

        expect(c.runs).toBe(2);
        dispose(c.node);
    });

    it('a paused effect that is disposed never runs again', () => {
        let other = signal(0),
            s = signal(0),
            c = counter(s),
            o = counter(other);

        pause(c.node);
        write(s, 1);
        flush();
        dispose(c.node);
        resume(c.node);
        flush();
        write(s, 2);
        write(other, 1);
        flush();

        expect(c.runs).toBe(1);
        expect(o.runs).toBe(2);
        dispose(o.node);
    });

    it('pause and resume on a disposed effect are no-ops', () => {
        let s = signal(0),
            c = counter(s);

        dispose(c.node);

        expect(() => pause(c.node)).not.toThrow();
        expect(() => resume(c.node)).not.toThrow();

        write(s, 1);
        flush();
        expect(c.runs).toBe(1);
    });

    it('disposing the owner while a child is paused disposes the child for good', () => {
        let child = null as unknown as Computed<unknown>,
            childRuns = 0,
            s = signal(0),
            stop = root((d) => {
                effect(() => {
                    child = effect(() => {
                        read(s);
                        childRuns++;
                    });
                });

                return d;
            });

        pause(child);
        write(s, 1);
        flush();
        expect(childRuns).toBe(1);

        stop();
        resume(child);
        flush();
        write(s, 2);
        flush();

        expect(childRuns).toBe(1);
    });

    it('pausing from inside a re-run sticks', () => {
        let runs = 0,
            s = signal(0),
            node = effect(() => {
                read(s);
                runs++;

                if (runs === 2) {
                    pause(owner()!);
                }
            });

        write(s, 1);
        flush();
        write(s, 2);
        flush();

        expect(runs).toBe(2);

        resume(node);
        flush();
        expect(runs).toBe(3);

        write(s, 3);
        flush();
        expect(runs).toBe(4);
        dispose(node);
    });

    it('an effect that pauses itself before reading keeps its dependencies and replays on resume', () => {
        let live = true,
            runs = 0,
            s = signal(0),
            node = effect(() => {
                runs++;

                if (!live) {
                    pause(owner()!);
                    return;
                }

                read(s);
            });

        live = false;
        write(s, 1);
        flush();
        expect(runs).toBe(2);

        write(s, 2);
        flush();
        expect(runs).toBe(2);

        live = true;
        resume(node);
        flush();
        expect(runs).toBe(3);

        write(s, 3);
        flush();
        expect(runs).toBe(4);
        dispose(node);
    });

    it('an effect that pauses itself after reading everything does not replay unless dirtied', () => {
        let runs = 0,
            s = signal(0),
            node = effect(() => {
                read(s);
                runs++;

                if (runs === 2) {
                    pause(owner()!);
                }
            });

        write(s, 1);
        flush();
        resume(node);
        flush();

        expect(runs).toBe(2);

        write(s, 2);
        flush();
        expect(runs).toBe(3);
        dispose(node);
    });

    it('rejects computeds', () => {
        let c = computed(() => 1);

        expect(() => pause(c)).toThrow('@esportsplus/reactivity: pause() expects an effect');
        expect(() => resume(c)).toThrow('@esportsplus/reactivity: resume() expects an effect');
        dispose(c);
    });
});

import { describe, expect, it } from 'vitest';
import { computed, effect, flush, peek, read, signal, write } from '~/system';


describe('invalidate()', () => {
    it('re-runs the computed fn with no dependency change', () => {
        let runs = 0,
            s = signal(1);

        let c = computed(() => {
            runs++;

            return read(s);
        });

        effect(() => {
            read(c);
        });

        expect(runs).toBe(1);

        computed.invalidate(c);
        flush();

        expect(runs).toBe(2);
    });

    it('dependents re-run only when the forced re-run changes the value', () => {
        let changingRuns = 0,
            s = signal(1),
            stableRuns = 0,
            ticks = 0;

        let changing = computed(() => {
            read(s);

            return ++ticks;
        });

        let stable = computed(() => read(s));

        effect(() => {
            stableRuns++;
            read(stable);
        });

        effect(() => {
            changingRuns++;
            read(changing);
        });

        computed.invalidate(stable);
        flush();

        expect(stableRuns).toBe(1);

        computed.invalidate(changing);
        flush();

        expect(changingRuns).toBe(2);
    });

    it('re-dispatches an asyncComputed factory (refetch via the asyncMeta redirect)', async () => {
        let fetches = 0;

        let node = computed(() => {
            fetches++;

            return Promise.resolve(fetches);
        });

        let stop = effect(() => {
            read(node);
        });

        await new Promise((r) => setTimeout(r, 0));

        expect(fetches).toBe(1);
        expect(read(node)).toBe(1);

        computed.invalidate(node);
        await new Promise((r) => setTimeout(r, 0));

        expect(fetches).toBe(2);
        expect(read(node)).toBe(2);

        stop();
    });

    it('forces a side-effecting computed (the public effect encoding) to re-run without propagating', () => {
        let keeperRuns = 0,
            s = signal(1),
            sideRuns = 0;

        let c = computed<void>(() => {
            read(s);
            sideRuns++;
        });

        effect(() => {
            keeperRuns++;
            read(c);
        });

        expect(sideRuns).toBe(1);
        expect(keeperRuns).toBe(1);

        computed.invalidate(c);
        flush();

        expect(sideRuns).toBe(2);
        expect(keeperRuns).toBe(1);
    });

    it('the global-version fast path does not swallow a forced re-run', () => {
        let runs = 0,
            s = signal(1);

        let c = computed(() => {
            runs++;

            return read(s);
        });

        effect(() => {
            read(c);
        });

        write(s, 2);
        flush();

        expect(runs).toBe(2);

        // Fully settled: c carries the current gv stamp. Without writes++ inside invalidate,
        // this synchronous pull would exit through the fast path and skip the re-run. peek()
        // forces the pull unconditionally (read() outside an observer returns the cached value).
        computed.invalidate(c);

        expect(peek(c)).toBe(2);
        expect(runs).toBe(3);

        flush();

        expect(runs).toBe(3);
    });
});

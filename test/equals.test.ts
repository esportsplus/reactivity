import { describe, expect, it } from 'vitest';
import { computed, effect, flush, peek, read, signal, write } from '~/system';


describe('custom equals', () => {
    it('a signal with an always-true comparator never propagates (and never stores)', () => {
        let runs = 0,
            s = signal(0, () => true);

        effect(() => {
            runs++;
            read(s);
        });

        expect(runs).toBe(1);

        write(s, 1);
        flush();

        expect(runs).toBe(1);
        expect(peek(s)).toBe(0);
    });

    it('Object.is suppresses a NaN re-write; the default === re-triggers on NaN', () => {
        let defaultRuns = 0,
            isRuns = 0,
            sDefault = signal(NaN),
            sIs = signal(NaN, Object.is);

        effect(() => {
            isRuns++;
            read(sIs);
        });

        effect(() => {
            defaultRuns++;
            read(sDefault);
        });

        write(sIs, NaN);
        flush();

        expect(isRuns).toBe(1);

        write(sDefault, NaN);
        flush();

        expect(defaultRuns).toBe(2);
    });

    it('a computed custom equals suppresses propagation while the cached value still updates', () => {
        let cRuns = 0,
            effectRuns = 0,
            s = signal(1);

        let c = computed(() => {
            cRuns++;

            return { parity: read(s) % 2, tick: cRuns };
        }, (a, b) => a.parity === b.parity);

        effect(() => {
            effectRuns++;
            read(c);
        });

        expect(cRuns).toBe(1);
        expect(effectRuns).toBe(1);

        write(s, 3);
        flush();

        expect(cRuns).toBe(2);
        expect(effectRuns).toBe(1);
        expect(peek(c).tick).toBe(2);

        write(s, 2);
        flush();

        expect(effectRuns).toBe(2);
        expect(peek(c).parity).toBe(0);
    });

    it('error recovery propagates under an always-true comparator (the hadError leg wins)', () => {
        let log: number[] = [],
            s = signal(0);

        let c = computed(() => {
            if (read(s) === 1) {
                throw new Error('equals boom');
            }

            return 0;
        }, () => true);

        let d = computed(() => {
            try {
                return read(c);
            }
            catch {
                return -1;
            }
        });

        effect(() => {
            log.push(read(d));
        });

        expect(log).toEqual([0]);

        write(s, 1);
        flush();

        expect(log).toEqual([0, -1]);
        expect(() => read(c)).toThrow('equals boom');

        write(s, 0);
        flush();

        expect(log).toEqual([0, -1, 0]);
    });

    it('the default path is byte-identical: no comparator gates with ===', () => {
        let runs = 0,
            s = signal(1);

        effect(() => {
            runs++;
            read(s);
        });

        write(s, 1);
        flush();

        expect(runs).toBe(1);

        write(s, 2);
        flush();

        expect(runs).toBe(2);
    });
});

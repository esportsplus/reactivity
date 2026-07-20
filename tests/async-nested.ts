import { describe, expect, it } from 'vitest';
import { computed, effect, read, root, signal } from '~/system';
import type { Computed } from '~/system';

describe('async computed created mid-tracking', () => {
    it('detects async when it is not the first tracked op', async () => {
        let captured: Computed<number | undefined> | null = null,
            s = signal(0);
        root(() => {
            effect(() => {
                read(s);                                        // 1st tracked op
                captured = computed(() => Promise.resolve(42)); // 2nd op — deferred branch
            });
        });
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
        expect(read(captured!)).toBe(42);
    });
});

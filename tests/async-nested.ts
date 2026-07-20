import { describe, expect, it } from 'vitest';
import { computed, effect, read, root, signal } from '~/system';
import { waitFor } from './lib/wait-for';
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
        await waitFor(() => read(captured!) === 42, 'nested async resolves to 42');
        expect(read(captured!)).toBe(42);
    });
});

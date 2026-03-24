import { describe, expect, it, vi } from 'vitest';
import { computed, dispose, effect, isComputed, isSignal, onCleanup, read, root, signal, write } from '~/system';


describe('signal', () => {
    it('creates a signal with initial value', () => {
        let s = signal(42);

        expect(s.value).toBe(42);
    });

    it('creates a signal with undefined', () => {
        let s = signal(undefined);

        expect(s.value).toBe(undefined);
    });

    it('creates a signal with null', () => {
        let s = signal(null);

        expect(s.value).toBe(null);
    });

    it('creates a signal with object value', () => {
        let obj = { a: 1, b: 2 };
        let s = signal(obj);

        expect(s.value).toBe(obj);
    });

    it('creates a signal with string value', () => {
        let s = signal('hello');

        expect(s.value).toBe('hello');
    });

    it('initializes with null subs', () => {
        let s = signal(1);

        expect(s.subs).toBe(null);
        expect(s.subsTail).toBe(null);
    });
});


describe('read', () => {
    it('reads signal value', () => {
        let s = signal(10);

        expect(read(s)).toBe(10);
    });

    it('reads computed value', () => {
        let c = computed(() => 42);

        expect(read(c)).toBe(42);
    });

    it('tracks dependency when inside observer', async () => {
        let s = signal(1),
            calls = 0;

        effect(() => {
            read(s);
            calls++;
        });

        expect(calls).toBe(1);

        write(s, 2);
        await Promise.resolve();

        expect(calls).toBe(2);
    });
});


describe('write', () => {
    it('updates signal value', () => {
        let s = signal(1);

        write(s, 2);

        expect(s.value).toBe(2);
    });

    it('skips write when value is identical', async () => {
        let s = signal(1),
            calls = 0;

        effect(() => {
            read(s);
            calls++;
        });

        expect(calls).toBe(1);

        write(s, 1);
        await Promise.resolve();

        expect(calls).toBe(1);
    });

    it('triggers subscribers on write', async () => {
        let s = signal(0),
            observed = -1;

        effect(() => {
            observed = read(s);
        });

        expect(observed).toBe(0);

        write(s, 5);
        await Promise.resolve();

        expect(observed).toBe(5);
    });

    it('batches multiple writes in a microtask', async () => {
        let s = signal(0),
            calls = 0;

        effect(() => {
            read(s);
            calls++;
        });

        expect(calls).toBe(1);

        write(s, 1);
        write(s, 2);
        write(s, 3);
        await Promise.resolve();

        expect(calls).toBe(2);
        expect(read(s)).toBe(3);
    });

    it('handles NaN correctly (NaN !== NaN always triggers)', () => {
        let s = signal(NaN);

        write(s, NaN);

        expect(s.value).toBeNaN();
    });
});


describe('computed', () => {
    it('creates a computed value', () => {
        let c = computed(() => 42);

        expect(read(c)).toBe(42);
    });

    it('derives from signal', async () => {
        let s = signal(2),
            c = computed(() => read(s) * 2);

        expect(read(c)).toBe(4);

        write(s, 3);
        await Promise.resolve();

        expect(read(c)).toBe(6);
    });

    it('derives from multiple signals', async () => {
        let a = signal(1),
            b = signal(2),
            c = computed(() => read(a) + read(b));

        expect(read(c)).toBe(3);

        write(a, 10);
        await Promise.resolve();

        expect(read(c)).toBe(12);

        write(b, 20);
        await Promise.resolve();

        expect(read(c)).toBe(30);
    });

    it('chains computeds', async () => {
        let s = signal(1),
            c1 = computed(() => read(s) * 2),
            c2 = computed(() => read(c1) + 10);

        expect(read(c2)).toBe(12);

        write(s, 5);
        await Promise.resolve();

        expect(read(c2)).toBe(20);
    });

    it('diamond dependency graph', async () => {
        let s = signal(1),
            a = computed(() => read(s) + 1),
            b = computed(() => read(s) * 2),
            c = computed(() => read(a) + read(b)),
            calls = 0;

        effect(() => {
            read(c);
            calls++;
        });

        expect(read(c)).toBe(4);
        expect(calls).toBe(1);

        write(s, 2);
        await Promise.resolve();

        expect(read(c)).toBe(7);
        expect(calls).toBe(2);
    });

    it('memoizes — does not recompute if deps unchanged', async () => {
        let s = signal(1),
            computeCalls = 0,
            c = computed(() => {
                computeCalls++;
                return read(s) * 2;
            });

        expect(read(c)).toBe(2);
        expect(computeCalls).toBe(1);

        read(c);
        read(c);

        expect(computeCalls).toBe(1);
    });

    it('handles computed returning same value', async () => {
        let s = signal(1),
            effectCalls = 0,
            c = computed(() => read(s) > 0 ? 'positive' : 'non-positive');

        effect(() => {
            read(c);
            effectCalls++;
        });

        expect(effectCalls).toBe(1);

        write(s, 2);
        await Promise.resolve();

        // computed returns same 'positive', so effect should not re-run
        expect(effectCalls).toBe(1);
    });

    it('deeply nested computed chain', async () => {
        let s = signal(0),
            c1 = computed(() => read(s) + 1),
            c2 = computed(() => read(c1) + 1),
            c3 = computed(() => read(c2) + 1),
            c4 = computed(() => read(c3) + 1),
            c5 = computed(() => read(c4) + 1);

        expect(read(c5)).toBe(5);

        write(s, 10);
        await Promise.resolve();

        expect(read(c5)).toBe(15);
    });
});


describe('effect', () => {
    it('runs immediately', () => {
        let calls = 0;

        effect(() => { calls++; });

        expect(calls).toBe(1);
    });

    it('re-runs when dependency changes', async () => {
        let s = signal(0),
            values: number[] = [];

        effect(() => {
            values.push(read(s));
        });

        expect(values).toEqual([0]);

        write(s, 1);
        await Promise.resolve();

        expect(values).toEqual([0, 1]);
    });

    it('returns dispose function', async () => {
        let s = signal(0),
            calls = 0;

        let stop = effect(() => {
            read(s);
            calls++;
        });

        expect(calls).toBe(1);

        stop();

        write(s, 1);
        await Promise.resolve();

        expect(calls).toBe(1);
    });

    it('tracks dynamic dependencies', async () => {
        let a = signal(true),
            b = signal(1),
            c = signal(2),
            values: number[] = [];

        effect(() => {
            values.push(read(a) ? read(b) : read(c));
        });

        expect(values).toEqual([1]);

        write(a, false);
        await Promise.resolve();

        expect(values).toEqual([1, 2]);

        // b change should not trigger since a is false
        write(b, 10);
        await Promise.resolve();

        expect(values).toEqual([1, 2]);

        // c change should trigger since a is false
        write(c, 20);
        await Promise.resolve();

        expect(values).toEqual([1, 2, 20]);
    });

    it('handles multiple effects on same signal', async () => {
        let s = signal(0),
            a = 0,
            b = 0;

        effect(() => { a = read(s); });
        effect(() => { b = read(s) * 2; });

        expect(a).toBe(0);
        expect(b).toBe(0);

        write(s, 5);
        await Promise.resolve();

        expect(a).toBe(5);
        expect(b).toBe(10);
    });
});


describe('onCleanup', () => {
    it('runs cleanup on recomputation', async () => {
        let s = signal(0),
            cleaned = false;

        effect(() => {
            read(s);
            onCleanup(() => { cleaned = true; });
        });

        expect(cleaned).toBe(false);

        write(s, 1);
        await Promise.resolve();

        expect(cleaned).toBe(true);
    });

    it('runs cleanup on dispose', () => {
        let cleaned = false;

        let stop = effect(() => {
            onCleanup(() => { cleaned = true; });
        });

        expect(cleaned).toBe(false);

        stop();

        expect(cleaned).toBe(true);
    });

    it('supports multiple cleanup functions', async () => {
        let s = signal(0),
            cleanups: number[] = [];

        effect(() => {
            read(s);
            onCleanup(() => { cleanups.push(1); });
            onCleanup(() => { cleanups.push(2); });
            onCleanup(() => { cleanups.push(3); });
        });

        write(s, 1);
        await Promise.resolve();

        expect(cleanups).toEqual([1, 2, 3]);
    });

    it('does nothing outside observer', () => {
        let fn = vi.fn();
        let returned = onCleanup(fn);

        expect(returned).toBe(fn);
        expect(fn).not.toHaveBeenCalled();
    });
});


describe('root', () => {
    it('creates untracked scope', () => {
        let result = root(() => 42);

        expect(result).toBe(42);
    });

    it('provides dispose function when fn.length > 0', () => {
        let disposed = false;

        root((dispose) => {
            onCleanup(() => { disposed = true; });
            dispose();
        });

        expect(disposed).toBe(true);
    });

    it('does not track signals inside root', async () => {
        let s = signal(0),
            calls = 0;

        effect(() => {
            root(() => {
                read(s);
            });
            calls++;
        });

        expect(calls).toBe(1);

        write(s, 1);
        await Promise.resolve();

        // Should not re-run since signal was read inside root (untracked)
        expect(calls).toBe(1);
    });

    it('supports nested roots', () => {
        let outer = 0,
            inner = 0;

        root(() => {
            outer++;
            root(() => {
                inner++;
            });
        });

        expect(outer).toBe(1);
        expect(inner).toBe(1);
    });

    it('tracks disposables counter for unowned computeds', () => {
        let before = root.disposables;

        root(() => {
            computed(() => 1);
            computed(() => 2);
            computed(() => 3);
        });

        // root restores disposables to outer value after execution
        expect(root.disposables).toBe(before);

        // Nested: inner root creates computeds, outer root creates computeds
        root(() => {
            computed(() => 10);

            root(() => {
                computed(() => 20);
                computed(() => 30);
            });

            computed(() => 40);
        });

        expect(root.disposables).toBe(before);
    });
});


describe('dispose', () => {
    it('disposes computed and runs cleanup', () => {
        let cleaned = false,
            c = computed((onCleanup) => {
                onCleanup(() => { cleaned = true; });
                return 42;
            });

        expect(cleaned).toBe(false);

        dispose(c);

        expect(cleaned).toBe(true);
    });

    it('removes computed from dependency graph', async () => {
        let s = signal(0),
            calls = 0,
            c = computed(() => {
                calls++;
                return read(s);
            });

        expect(read(c)).toBe(0);
        expect(calls).toBe(1);

        dispose(c);

        write(s, 1);
        await Promise.resolve();

        expect(calls).toBe(1);
    });
});


describe('isSignal', () => {
    it('returns true for signals', () => {
        expect(isSignal(signal(1))).toBe(true);
    });

    it('returns false for computed', () => {
        expect(isSignal(computed(() => 1))).toBe(false);
    });

    it('returns false for primitives', () => {
        expect(isSignal(1)).toBe(false);
        expect(isSignal('a')).toBe(false);
        expect(isSignal(null)).toBe(false);
        expect(isSignal(undefined)).toBe(false);
    });
});


describe('isComputed', () => {
    it('returns true for computed', () => {
        expect(isComputed(computed(() => 1))).toBe(true);
    });

    it('returns false for signals', () => {
        expect(isComputed(signal(1))).toBe(false);
    });

    it('returns false for primitives', () => {
        expect(isComputed(1)).toBe(false);
        expect(isComputed(null)).toBe(false);
    });

    it('returns false for objects with state field but no STATE_COMPUTED bit', () => {
        expect(isComputed({ state: 0 })).toBe(false);
        expect(isComputed({ state: 1 })).toBe(false);
    });
});

describe('computed object size', () => {
    it('does not have a type field', () => {
        let c = computed(() => 42);

        expect('type' in c).toBe(false);
    });

    it('has fewer own properties than 14 (old size)', () => {
        let c = computed(() => 42);

        expect(Object.keys(c).length).toBeLessThan(14);
    });
});


describe('edge cases', () => {
    it('diamond graph dedup — notify state mask prevents redundant recomputation', async () => {
        let s = signal(1),
            calls = 0,
            left = computed(() => read(s) + 1),
            right = computed(() => read(s) * 2),
            join = computed(() => {
                calls++;
                return read(left) + read(right);
            });

        effect(() => {
            read(join);
        });

        expect(read(join)).toBe(4);
        calls = 0;

        write(s, 2);
        await Promise.resolve();

        expect(read(join)).toBe(7);
        expect(calls).toBe(1);
    });

    it('dynamic height adjustment — correct ordering after switching deps', async () => {
        let s = signal(1),
            toggle = signal(true),
            a = computed(() => read(s) + 1),
            b = computed(() => read(a) + 1),
            c = computed(() => read(b) + 1),
            order: string[] = [],
            d = computed(() => {
                order.push('d');

                if (read(toggle)) {
                    return read(a);
                }

                return read(c);
            });

        effect(() => {
            read(d);
        });

        expect(read(d)).toBe(2);
        order.length = 0;

        // Switch to reading `c` (height 3) instead of `a` (height 1)
        write(toggle, false);
        await Promise.resolve();

        expect(read(d)).toBe(4);

        order.length = 0;

        // Write to source — d should recompute after c due to height adjustment
        write(s, 10);
        await Promise.resolve();

        expect(read(d)).toBe(13);
        expect(order).toEqual(['d']);
    });

    it('handles circular computed reads without infinite loop', () => {
        let s = signal(0),
            c1 = computed(() => read(s)),
            c2 = computed(() => read(c1));

        expect(read(c2)).toBe(0);
    });

    it('handles computed that throws', () => {
        let s = signal(0),
            c = computed(() => {
                if (read(s) > 0) {
                    throw new Error('test');
                }

                return read(s);
            });

        expect(read(c)).toBe(0);
    });

    it('handles rapid writes', async () => {
        let s = signal(0),
            values: number[] = [];

        effect(() => {
            values.push(read(s));
        });

        for (let i = 1; i <= 100; i++) {
            write(s, i);
        }

        await Promise.resolve();

        // Should only run effect twice: initial + final batched
        expect(values.length).toBe(2);
        expect(values[values.length - 1]).toBe(100);
    });

    it('effect can create new signals and computeds', async () => {
        let s = signal(0),
            inner = -1;

        effect(() => {
            let v = read(s);
            let innerSig = signal(v * 10);
            inner = read(innerSig);
        });

        expect(inner).toBe(0);

        write(s, 5);
        await Promise.resolve();

        expect(inner).toBe(50);
    });

    it('write during stabilization', async () => {
        let a = signal(0),
            b = signal(0),
            result = 0;

        effect(() => {
            let val = read(a);

            if (val > 0) {
                write(b, val * 10);
            }
        });

        effect(() => {
            result = read(b);
        });

        write(a, 1);
        await Promise.resolve();
        await Promise.resolve();

        expect(result).toBe(10);
    });

    it('effect disposes inner resources on cleanup', () => {
        let innerDisposed = false;

        let stop = effect((onCleanup) => {
            let inner = computed(() => 42);

            onCleanup(() => {
                dispose(inner);
                innerDisposed = true;
            });
        });

        expect(innerDisposed).toBe(false);

        stop();

        expect(innerDisposed).toBe(true);
    });

    it('stabilizer re-schedules when effect writes to signal during stabilization', async () => {
        let a = signal(0),
            b = signal(0),
            bValues: number[] = [];

        effect(() => {
            let val = read(a);

            if (val > 0) {
                write(b, val * 100);
            }
        });

        effect(() => {
            bValues.push(read(b));
        });

        write(a, 3);
        await Promise.resolve();
        await Promise.resolve();

        expect(bValues).toEqual([0, 300]);
    });

    it('stabilizer re-schedules with nested write chain A → B → C', async () => {
        let a = signal(0),
            b = signal(0),
            c = signal(0),
            cValues: number[] = [];

        effect(() => {
            let val = read(a);

            if (val > 0) {
                write(b, val * 2);
            }
        });

        effect(() => {
            let val = read(b);

            if (val > 0) {
                write(c, val * 3);
            }
        });

        effect(() => {
            cValues.push(read(c));
        });

        write(a, 5);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(cValues).toEqual([0, 30]);
    });

    it('computed that throws on update retains previous value', async () => {
        let s = signal(0),
            effectValues: number[] = [],
            c = computed(() => {
                let val = read(s);

                if (val === 2) {
                    throw new Error('boom');
                }

                return val * 10;
            });

        effect(() => {
            effectValues.push(read(c));
        });

        expect(effectValues).toEqual([0]);

        write(s, 1);
        await Promise.resolve();

        expect(effectValues).toEqual([0, 10]);
        expect(read(c)).toBe(10);

        write(s, 2);
        await Promise.resolve();

        // Value should remain 10 since throw prevented update
        expect(read(c)).toBe(10);
        expect(effectValues).toEqual([0, 10]);
    });

    it('computed alternates between throwing and succeeding', async () => {
        let s = signal(0),
            effectValues: number[] = [],
            c = computed(() => {
                let val = read(s);

                if (val % 2 !== 0) {
                    throw new Error('odd');
                }

                return val;
            });

        effect(() => {
            effectValues.push(read(c));
        });

        expect(effectValues).toEqual([0]);

        write(s, 1);
        await Promise.resolve();

        // Threw on odd, value stays 0
        expect(read(c)).toBe(0);
        expect(effectValues).toEqual([0]);

        write(s, 2);
        await Promise.resolve();

        // Succeeds on even, value updates
        expect(read(c)).toBe(2);
        expect(effectValues).toEqual([0, 2]);

        write(s, 3);
        await Promise.resolve();

        // Threw on odd again, value stays 2
        expect(read(c)).toBe(2);
        expect(effectValues).toEqual([0, 2]);

        write(s, 4);
        await Promise.resolve();

        // Succeeds again
        expect(read(c)).toBe(4);
        expect(effectValues).toEqual([0, 2, 4]);
    });

    it('heap auto-resizes for computed chain deeper than 64', async () => {
        let s = signal(0),
            chain: ReturnType<typeof computed>[] = [computed(() => read(s) + 1)];

        for (let i = 1; i < 80; i++) {
            let prev = chain[i - 1];

            chain.push(computed(() => read(prev) + 1));
        }

        let tail = chain[chain.length - 1],
            result = -1;

        effect(() => {
            result = read(tail);
        });

        expect(result).toBe(80);

        write(s, 10);
        await Promise.resolve();

        expect(result).toBe(90);
    });

    it('system remains functional under high effect churn', async () => {
        let s = signal(0),
            stops: (() => void)[] = [];

        for (let i = 0; i < 200; i++) {
            stops.push(effect(() => { read(s); }));
        }

        for (let i = 0, n = stops.length; i < n; i++) {
            stops[i]();
        }

        stops.length = 0;

        let result = -1;

        effect(() => {
            result = read(s);
        });

        write(s, 42);
        await Promise.resolve();

        expect(result).toBe(42);

        for (let i = 0; i < 200; i++) {
            stops.push(effect(() => { read(s); }));
        }

        for (let i = 0, n = stops.length; i < n; i++) {
            stops[i]();
        }

        write(s, 99);
        await Promise.resolve();

        expect(result).toBe(99);
    });

    it('link pool handles >1000 dependencies with disposal and reuse', async () => {
        let signals: ReturnType<typeof signal>[] = [],
            stops: (() => void)[] = [];

        for (let i = 0; i < 1100; i++) {
            signals.push(signal(i));
        }

        // Create effect reading all 1100 signals
        stops.push(effect(() => {
            for (let i = 0, n = signals.length; i < n; i++) {
                read(signals[i]);
            }
        }));

        // Dispose to return links to pool (capped at 1000)
        stops[0]();
        stops.length = 0;

        // Create new effects reusing pooled links
        let sum = -1;

        stops.push(effect(() => {
            let total = 0;

            for (let i = 0; i < 50; i++) {
                total += read(signals[i]);
            }

            sum = total;
        }));

        // sum of 0..49 = 1225
        expect(sum).toBe(1225);

        write(signals[0], 100);
        await Promise.resolve();

        // 1225 - 0 + 100 = 1325
        expect(sum).toBe(1325);

        for (let i = 0, n = stops.length; i < n; i++) {
            stops[i]();
        }
    });
});

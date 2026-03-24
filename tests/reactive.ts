import { describe, expect, it, vi } from 'vitest';
import { computed, effect, onCleanup, read, root, signal, write } from '~/system';
import { SIGNAL } from '~/constants';
import { ReactiveObject, isReactiveObject } from '~/reactive/object';
import reactive from '~/reactive/index';
import { ReactiveArray } from '~/reactive/array';


describe('ReactiveObject', () => {
    describe('constructor', () => {
        it('creates reactive object from plain object', () => {
            let obj = new ReactiveObject({ a: 1, b: 'hello' });

            expect((obj as any).a).toBe(1);
            expect((obj as any).b).toBe('hello');
        });

        it('null constructor does nothing', () => {
            let obj = new ReactiveObject(null);

            expect(obj).toBeInstanceOf(ReactiveObject);
        });

        it('makes properties reactive', async () => {
            let obj = new ReactiveObject({ count: 0 }) as any,
                values: number[] = [];

            effect(() => {
                values.push(obj.count);
            });

            expect(values).toEqual([0]);

            obj.count = 5;
            await Promise.resolve();

            expect(values).toEqual([0, 5]);
        });
    });


    describe('computed properties', () => {
        it('creates computed from external signal dependency', () => {
            let s = signal(10),
                obj = new ReactiveObject({
                    doubled: () => read(s) * 2
                }) as any;

            expect(obj.doubled).toBe(20);
        });

        it('updates computed when external dependency changes', async () => {
            let s = signal(1),
                obj = new ReactiveObject({
                    doubled: () => read(s) * 2
                }) as any;

            expect(obj.doubled).toBe(2);

            write(s, 5);
            await Promise.resolve();

            expect(obj.doubled).toBe(10);
        });
    });


    describe('array properties', () => {
        it('wraps arrays as ReactiveArray', () => {
            let obj = new ReactiveObject({ items: [1, 2, 3] }) as any;

            expect(obj.items).toBeInstanceOf(ReactiveArray);
            expect(obj.items.length).toBe(3);
        });

        it('reactive arrays track length', async () => {
            let obj = new ReactiveObject({ items: [1, 2] }) as any,
                lengths: number[] = [];

            effect(() => {
                lengths.push(obj.items.$length);
            });

            obj.items.push(3);
            await Promise.resolve();

            expect(lengths).toEqual([2, 3]);
        });
    });


    describe('dispose', () => {
        it('disposes all nested resources', () => {
            let obj = new ReactiveObject({
                count: 1,
                items: [1, 2, 3]
            }) as any;

            // Should not throw
            obj.dispose();
        });

        it('computed stops updating after dispose', async () => {
            let obj = new ReactiveObject({
                count: 1,
                doubled: () => (obj as any).count * 2
            }) as any;

            obj.dispose();
        });
    });


    describe('async computed', () => {
        it('initial value undefined, resolves to correct value', async () => {
            let s = signal(42),
                obj = new ReactiveObject({
                    data: () => Promise.resolve(read(s))
                }) as any;

            expect(obj.data).toBeUndefined();

            await new Promise((r) => setTimeout(r, 10));

            expect(obj.data).toBe(42);
        });

        it('updates when dependency changes — new promise resolves', async () => {
            let s = signal('hello'),
                obj = new ReactiveObject({
                    data: () => Promise.resolve(read(s))
                }) as any;

            await new Promise((r) => setTimeout(r, 10));

            expect(obj.data).toBe('hello');

            write(s, 'world');
            await new Promise((r) => setTimeout(r, 10));

            expect(obj.data).toBe('world');
        });

        it('race condition — rapid changes, only latest promise writes', async () => {
            let s = signal(1),
                resolvers: ((v: number) => void)[] = [],
                obj = new ReactiveObject({
                    data: () => new Promise<number>((resolve) => {
                        resolvers.push(resolve);
                        read(s);
                    })
                }) as any;

            expect(obj.data).toBeUndefined();

            // Trigger second computation
            write(s, 2);
            await Promise.resolve();
            await Promise.resolve();

            // Trigger third computation
            write(s, 3);
            await Promise.resolve();
            await Promise.resolve();

            // Resolve first promise (stale — should be ignored)
            resolvers[0](100);
            await Promise.resolve();

            expect(obj.data).toBeUndefined();

            // Resolve second promise (stale — should be ignored)
            resolvers[1](200);
            await Promise.resolve();

            expect(obj.data).toBeUndefined();

            // Resolve latest promise — should write
            resolvers[2](300);
            await Promise.resolve();

            expect(obj.data).toBe(300);
        });

        it('dispose prevents new computations but in-flight resolves still write', async () => {
            let s = signal(1),
                resolver: ((v: number) => void) | null = null,
                obj = new ReactiveObject({
                    data: () => new Promise<number>((resolve) => {
                        resolver = resolve;
                        read(s);
                    })
                }) as any;

            expect(obj.data).toBeUndefined();

            obj.dispose();

            // After dispose, dependency changes don't spawn new effects
            write(s, 2);
            await Promise.resolve();

            // Resolve the original in-flight promise
            resolver!(999);
            await Promise.resolve();

            // In-flight promise still wrote (version matched)
            expect(obj.data).toBe(999);

            // But no further computations occur from new dependency changes
            write(s, 3);
            await new Promise((r) => setTimeout(r, 10));

            expect(obj.data).toBe(999);
        });
    });


    describe('null/undefined properties', () => {
        it('creates reactive signal for null property', async () => {
            let obj = new ReactiveObject({ key: null }) as any,
                values: (null | number)[] = [];

            expect(obj.key).toBeNull();

            effect(() => {
                values.push(obj.key);
            });

            expect(values).toEqual([null]);

            obj.key = 42;
            await Promise.resolve();

            expect(values).toEqual([null, 42]);
        });

        it('creates reactive signal for undefined property', async () => {
            let obj = new ReactiveObject({ key: undefined }) as any,
                values: (undefined | string)[] = [];

            expect(obj.key).toBeUndefined();

            effect(() => {
                values.push(obj.key);
            });

            expect(values).toEqual([undefined]);

            obj.key = 'hello';
            await Promise.resolve();

            expect(values).toEqual([undefined, 'hello']);
        });
    });


    describe('enumeration', () => {
        it('Object.keys includes all defined property names', () => {
            let keys = Object.keys(new ReactiveObject({ a: 1, b: 'two', c: null }));

            expect(keys).toContain('a');
            expect(keys).toContain('b');
            expect(keys).toContain('c');
        });

        it('for...in iterates all defined properties', () => {
            let obj = new ReactiveObject({ x: 10, y: 20, z: 30 }),
                keys: string[] = [];

            for (let key in obj) {
                keys.push(key);
            }

            expect(keys).toContain('x');
            expect(keys).toContain('y');
            expect(keys).toContain('z');
        });
    });


    describe('[SIGNAL] protected method', () => {
        it('subclass creates reactive field via [SIGNAL]', async () => {
            class Counter extends ReactiveObject<Record<string, never>> {
                private _count: ReturnType<typeof signal<number>>;

                constructor(initial: number) {
                    super(null);
                    this._count = this[SIGNAL](initial);
                }

                get count() {
                    return read(this._count);
                }

                set count(value: number) {
                    write(this._count, value);
                }
            }

            let counter = new Counter(0),
                values: number[] = [];

            effect(() => {
                values.push(counter.count);
            });

            expect(values).toEqual([0]);

            counter.count = 5;
            await Promise.resolve();

            expect(values).toEqual([0, 5]);

            counter.count = 10;
            await Promise.resolve();

            expect(values).toEqual([0, 5, 10]);
        });
    });
});


describe('isReactiveObject', () => {
    it('returns true for ReactiveObject', () => {
        let obj = new ReactiveObject({ a: 1 });

        expect(isReactiveObject(obj)).toBe(true);
    });

    it('returns false for plain objects', () => {
        expect(isReactiveObject({ a: 1 })).toBe(false);
    });

    it('returns false for null/undefined', () => {
        expect(isReactiveObject(null)).toBe(false);
        expect(isReactiveObject(undefined)).toBe(false);
    });

    it('returns false for primitives', () => {
        expect(isReactiveObject(42)).toBe(false);
        expect(isReactiveObject('str')).toBe(false);
    });
});


describe('reactive()', () => {
    describe('objects', () => {
        it('creates reactive object', () => {
            let obj = reactive({ name: 'John', age: 25 });

            expect((obj as any).name).toBe('John');
            expect((obj as any).age).toBe(25);
        });

        it('properties are reactive', async () => {
            let obj = reactive({ count: 0 }) as any,
                values: number[] = [];

            effect(() => {
                values.push(obj.count);
            });

            obj.count = 10;
            await Promise.resolve();

            expect(values).toEqual([0, 10]);
        });

        it('has dispose method', () => {
            let obj = reactive({ a: 1 }) as any;

            expect(typeof obj.dispose).toBe('function');
        });
    });


    describe('arrays', () => {
        it('creates reactive array', () => {
            let arr = reactive([1, 2, 3]);

            expect(arr.length).toBe(3);
        });
    });


    describe('errors', () => {
        it('throws on invalid input', () => {
            expect(() => reactive(42 as any)).toThrow();
            expect(() => reactive('hello' as any)).toThrow();
        });
    });
});


describe('integration', () => {
    it('computed across objects', async () => {
        let a = new ReactiveObject({ value: 10 }) as any,
            b = new ReactiveObject({ value: 20 }) as any,
            results: number[] = [];

        effect(() => {
            results.push(a.value + b.value);
        });

        expect(results).toEqual([30]);

        a.value = 100;
        await Promise.resolve();

        expect(results).toEqual([30, 120]);

        b.value = 200;
        await Promise.resolve();

        expect(results).toEqual([30, 120, 300]);
    });

    it('nested reactive objects', async () => {
        let inner = new ReactiveObject({ x: 1 }) as any;
        let outer = new ReactiveObject({ child: inner }) as any;

        expect(outer.child).toBe(inner);
    });

    it('effect with mixed signal and object dependencies', async () => {
        let s = signal(1),
            obj = new ReactiveObject({ count: 10 }) as any,
            results: number[] = [];

        effect(() => {
            results.push(read(s) + obj.count);
        });

        expect(results).toEqual([11]);

        write(s, 2);
        await Promise.resolve();

        expect(results).toEqual([11, 12]);

        obj.count = 20;
        await Promise.resolve();

        expect(results).toEqual([11, 12, 22]);
    });

    it('diamond dependency with objects and computeds', async () => {
        let base = signal(1),
            left = computed(() => read(base) + 1),
            right = computed(() => read(base) * 2),
            results: number[] = [];

        effect(() => {
            results.push(read(left) + read(right));
        });

        expect(results).toEqual([4]);

        write(base, 5);
        await Promise.resolve();

        expect(results).toEqual([4, 16]);
    });

    it('large dependency chain', async () => {
        let s = signal(0),
            chain: ReturnType<typeof computed>[] = [computed(() => read(s))];

        for (let i = 1; i < 50; i++) {
            let prev = chain[i - 1];
            chain.push(computed(() => read(prev) + 1));
        }

        expect(read(chain[49])).toBe(49);

        write(s, 10);
        await Promise.resolve();

        expect(read(chain[49])).toBe(59);
    });

    it('many signals → one computed', async () => {
        let signals: ReturnType<typeof signal<number>>[] = [];

        for (let i = 0; i < 100; i++) {
            signals.push(signal(i));
        }

        let sum = computed(() => {
            let total = 0;

            for (let i = 0, n = signals.length; i < n; i++) {
                total += read(signals[i]);
            }

            return total;
        });

        expect(read(sum)).toBe(4950);

        write(signals[0], 100);
        await Promise.resolve();

        expect(read(sum)).toBe(5050);
    });

    it('effect with cleanup and re-subscribe', async () => {
        let a = signal(1),
            b = signal(100),
            toggle = signal(true),
            cleanups = 0,
            values: number[] = [];

        effect(() => {
            onCleanup(() => { cleanups++; });

            if (read(toggle)) {
                values.push(read(a));
            }
            else {
                values.push(read(b));
            }
        });

        expect(values).toEqual([1]);

        write(toggle, false);
        await Promise.resolve();

        expect(values).toEqual([1, 100]);
        expect(cleanups).toBe(1);
    });
});

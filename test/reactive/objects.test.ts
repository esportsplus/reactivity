import { describe, expect, it } from 'vitest';
import { computed, effect, read, signal, write } from '~/system';
import { COMPUTED, REACTIVE_ARRAY } from '~/constants';
import { ReactiveObject } from '~/reactive/object';
import { ReactiveArray } from '~/reactive/array';
import reactive from '~/reactive/index';


// These tests validate reactive object patterns from the compiler integration
// tests. Self-referential computed properties (e.g., `doubled: () => obj.count * 2`)
// require the compiler transform; here we use external signals instead.

describe('reactive object patterns', () => {
    describe('multi-property objects', () => {
        it('creates object with multiple typed properties', () => {
            let obj = new ReactiveObject({ age: 25, email: 'test@example.com', name: 'John' }) as any;

            expect(obj.age).toBe(25);
            expect(obj.email).toBe('test@example.com');
            expect(obj.name).toBe('John');
        });

        it('empty object constructor', () => {
            let obj = new ReactiveObject({}) as any;

            // No reactive properties created — only internal 'disposers' field
            expect(Object.keys(obj).filter((k: string) => k !== 'disposers')).toEqual([]);

            obj.dispose();
        });

        it('updates multiple properties independently', async () => {
            let obj = new ReactiveObject({ age: 25, name: 'John' }) as any,
                ages: number[] = [],
                names: string[] = [];

            effect(() => { ages.push(obj.age); });
            effect(() => { names.push(obj.name); });

            obj.age = 26;
            await Promise.resolve();

            obj.name = 'Jane';
            await Promise.resolve();

            expect(ages).toEqual([25, 26]);
            expect(names).toEqual(['John', 'Jane']);
        });
    });


    describe('computed properties', () => {
        it('string template computed', () => {
            let s = signal(5),
                obj = new ReactiveObject({
                    message: () => `Count is ${read(s)}`
                }) as any;

            expect(obj.message).toBe('Count is 5');
        });

        it('multiple computed from same dependency', async () => {
            let s = signal(5),
                obj = new ReactiveObject({
                    doubled: () => read(s) * 2,
                    message: () => `Count is ${read(s)}`
                }) as any;

            expect(obj.doubled).toBe(10);
            expect(obj.message).toBe('Count is 5');

            write(s, 10);
            await Promise.resolve();

            expect(obj.doubled).toBe(20);
            expect(obj.message).toBe('Count is 10');
        });

        it('effect tracks computed property changes', async () => {
            let s = signal(0),
                obj = new ReactiveObject({
                    doubled: () => read(s) * 2
                }) as any,
                values: number[] = [];

            effect(() => {
                values.push(obj.doubled);
            });

            expect(values).toEqual([0]);

            write(s, 5);
            await Promise.resolve();

            expect(values).toEqual([0, 10]);

            write(s, 10);
            await Promise.resolve();

            expect(values).toEqual([0, 10, 20]);
        });
    });


    describe('object with arrays', () => {
        it('array property is ReactiveArray', () => {
            let obj = new ReactiveObject({ items: [1, 2, 3] }) as any;

            expect(obj.items).toBeInstanceOf(ReactiveArray);
            expect([...obj.items]).toEqual([1, 2, 3]);
        });

        it('array push updates reactive length', async () => {
            let obj = new ReactiveObject({ items: [1, 2, 3] }) as any,
                lengths: number[] = [];

            effect(() => {
                lengths.push(obj.items.$length);
            });

            obj.items.push(4, 5);
            await Promise.resolve();

            expect(lengths).toEqual([3, 5]);
            expect([...obj.items]).toEqual([1, 2, 3, 4, 5]);
        });

        it('array computed using reduce via external signal', async () => {
            let items = new ReactiveArray(1, 2, 3),
                total = computed(() => {
                    let sum = 0;

                    for (let i = 0, n = items.length; i < n; i++) {
                        sum += items[i];
                    }

                    return sum;
                });

            expect(read(total)).toBe(6);
        });
    });


    describe('effects with objects', () => {
        it('effect tracks sum of two properties', async () => {
            let a = signal(1),
                b = signal(2),
                obj = new ReactiveObject({
                    sum: () => read(a) + read(b)
                }) as any,
                results: number[] = [];

            effect(() => {
                results.push(obj.sum);
            });

            expect(results).toEqual([3]);

            write(a, 10);
            await Promise.resolve();

            expect(results).toEqual([3, 12]);

            write(b, 20);
            await Promise.resolve();

            expect(results).toEqual([3, 12, 30]);
        });
    });


    describe('subclass overrides', () => {
        it('[COMPUTED] subclass creates computed field from external signal', async () => {
            class Doubled extends ReactiveObject<Record<string, never>> {
                private _doubled: ReturnType<typeof computed<number>>;

                constructor(source: ReturnType<typeof signal<number>>) {
                    super(null);
                    this._doubled = this[COMPUTED](() => read(source) * 2);
                }

                get doubled() {
                    return read(this._doubled);
                }
            }

            let s = signal(5),
                obj = new Doubled(s),
                values: number[] = [];

            expect(obj.doubled).toBe(10);

            effect(() => {
                values.push(obj.doubled);
            });

            expect(values).toEqual([10]);

            write(s, 10);
            await Promise.resolve();

            expect(obj.doubled).toBe(20);
            expect(values).toEqual([10, 20]);

            obj.dispose();
        });

        it('[REACTIVE_ARRAY] subclass creates ReactiveArray field', () => {
            class Collection extends ReactiveObject<Record<string, never>> {
                items: ReactiveArray<number>;

                constructor(values: number[]) {
                    super(null);
                    this.items = this[REACTIVE_ARRAY](values);
                }
            }

            let obj = new Collection([10, 20, 30]);

            expect(obj.items).toBeInstanceOf(ReactiveArray);
            expect([...obj.items]).toEqual([10, 20, 30]);

            obj.dispose();

            // After dispose, array should be cleared
            expect(obj.items.length).toBe(0);
        });
    });


    describe('dispose', () => {
        it('disposes object with computed properties', () => {
            let s = signal(42),
                obj = new ReactiveObject({
                    computed: () => read(s) * 2,
                    value: 42
                }) as any;

            expect(obj.value).toBe(42);
            expect(obj.computed).toBe(84);

            obj.dispose();
        });

        it('disposes object created via reactive()', () => {
            let obj = reactive({ value: 42 }) as any;

            expect(obj.value).toBe(42);

            obj.dispose();
        });

        it('calling dispose twice does not throw', () => {
            let s = signal(1),
                obj = new ReactiveObject({
                    computed: () => read(s) * 2,
                    items: [1, 2, 3]
                }) as any;

            expect(obj.computed).toBe(2);
            expect([...obj.items]).toEqual([1, 2, 3]);

            obj.dispose();

            expect(() => obj.dispose()).not.toThrow();
        });
    });
});

import { describe, expect, it } from 'vitest';
import { computed, effect, onCleanup, read, root, signal, write } from '~/system';
import { ReactiveArray } from '~/reactive/array';
import { ReactiveObject } from '~/reactive/object';


// These tests validate effect patterns from the compiler integration tests,
// including cleanup tracking, root scope, and multi-object dependencies.

describe('effect patterns', () => {
    describe('basic effect lifecycle', () => {
        it('effect runs on creation and updates', async () => {
            let s = signal(0),
                runs = 0;

            let dispose = effect(() => {
                read(s);
                runs++;
            });

            expect(runs).toBe(1);

            write(s, 1);
            await Promise.resolve();

            write(s, 2);
            await Promise.resolve();

            write(s, 3);
            await Promise.resolve();

            expect(runs).toBe(4);

            dispose();

            write(s, 4);
            write(s, 5);
            await Promise.resolve();

            expect(runs).toBe(4);
        });
    });


    describe('cleanup tracking', () => {
        it('counts cleanup calls across re-runs', async () => {
            let s = signal(0),
                cleanupCalls = 0,
                effectValues: number[] = [];

            let dispose = effect(() => {
                let current = read(s);

                effectValues.push(current);

                onCleanup(() => {
                    cleanupCalls++;
                });
            });

            expect(effectValues).toEqual([0]);
            expect(cleanupCalls).toBe(0);

            write(s, 1);
            await Promise.resolve();

            expect(effectValues).toEqual([0, 1]);
            expect(cleanupCalls).toBe(1);

            write(s, 2);
            await Promise.resolve();

            expect(effectValues).toEqual([0, 1, 2]);
            expect(cleanupCalls).toBe(2);

            dispose();

            expect(cleanupCalls).toBe(3);
        });
    });


    describe('effect with computed', () => {
        it('effect tracks computed property updates', async () => {
            let s = signal(10),
                doubled = computed(() => read(s) * 2),
                reads = 0,
                values: number[] = [];

            effect(() => {
                reads++;
                values.push(read(doubled));
            });

            expect(reads).toBe(1);
            expect(values).toEqual([20]);

            write(s, 20);
            await Promise.resolve();

            expect(reads).toBe(2);
            expect(values).toEqual([20, 40]);

            write(s, 30);
            await Promise.resolve();

            expect(reads).toBe(3);
            expect(values).toEqual([20, 40, 60]);
        });
    });


    describe('root scope', () => {
        it('root with reactive object and effect inside', async () => {
            let rootDisposed = false,
                effectRuns = 0;

            let result = root((dispose) => {
                let s = signal(1),
                    obj = new ReactiveObject({
                        doubled: () => read(s) * 2
                    }) as any;

                effect(() => {
                    effectRuns++;
                    read(s);
                });

                expect(effectRuns).toBe(1);
                expect(obj.doubled).toBe(2);

                write(s, 5);

                onCleanup(() => {
                    rootDisposed = true;
                });

                dispose();

                return 'root result';
            });

            expect(result).toBe('root result');
            expect(rootDisposed).toBe(true);
        });
    });


    describe('multiple object dependencies', () => {
        it('effect tracks properties from multiple objects', async () => {
            let obj1 = new ReactiveObject({ x: 1 }) as any,
                obj2 = new ReactiveObject({ y: 2 }) as any,
                obj3 = new ReactiveObject({ z: 3 }) as any,
                runs = 0,
                sums: number[] = [];

            effect(() => {
                runs++;
                sums.push(obj1.x + obj2.y + obj3.z);
            });

            expect(sums).toEqual([6]);

            obj1.x = 10;
            await Promise.resolve();

            expect(sums).toEqual([6, 15]);

            obj2.y = 20;
            await Promise.resolve();

            expect(sums).toEqual([6, 15, 33]);

            obj3.z = 30;
            await Promise.resolve();

            expect(sums).toEqual([6, 15, 33, 60]);
        });
    });


    describe('effect with reactive array', () => {
        it('effect tracks array length changes', async () => {
            let arr = new ReactiveArray(1, 2, 3),
                runs = 0,
                lengths: number[] = [];

            effect(() => {
                runs++;
                lengths.push(arr.$length);
            });

            expect(lengths).toEqual([3]);

            arr.push(4);
            await Promise.resolve();

            expect(lengths).toEqual([3, 4]);

            arr.pop();
            await Promise.resolve();

            expect(lengths).toEqual([3, 4, 3]);

            arr.splice(0, 1);
            await Promise.resolve();

            expect(lengths).toEqual([3, 4, 3, 2]);
        });
    });
});

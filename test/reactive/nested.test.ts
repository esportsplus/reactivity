import { describe, expect, it } from 'vitest';
import { computed, effect, read, signal, write } from '~/system';
import { ReactiveArray } from '~/reactive/array';
import { ReactiveObject } from '~/reactive/object';


// These tests validate nested/cross-object reactive patterns from the compiler
// integration tests. Self-referential computed properties require the compiler;
// here we use external signals or direct property access.

describe('nested reactive patterns', () => {
    describe('cross-object computed', () => {
        it('object reads properties from other objects', async () => {
            let config = new ReactiveObject({ debug: true, theme: 'dark' }) as any,
                settings = new ReactiveObject({ notifications: true, volume: 80 }) as any,
                themeValues: string[] = [],
                volumeValues: number[] = [];

            effect(() => { themeValues.push(config.theme); });
            effect(() => { volumeValues.push(settings.volume); });

            expect(themeValues).toEqual(['dark']);
            expect(volumeValues).toEqual([80]);

            config.theme = 'light';
            await Promise.resolve();

            expect(themeValues).toEqual(['dark', 'light']);

            settings.volume = 50;
            await Promise.resolve();

            expect(volumeValues).toEqual([80, 50]);
        });

        it('computed depends on properties from multiple objects', async () => {
            let obj1 = new ReactiveObject({ value: 10 }) as any,
                obj2 = new ReactiveObject({ value: 20 }) as any,
                combined = computed(() => obj1.value + obj2.value),
                values: number[] = [];

            effect(() => {
                values.push(read(combined));
            });

            expect(values).toEqual([30]);

            obj1.value = 100;
            await Promise.resolve();

            expect(values).toEqual([30, 120]);

            obj2.value = 200;
            await Promise.resolve();

            expect(values).toEqual([30, 120, 300]);
        });
    });


    describe('array of reactive objects', () => {
        it('todo list pattern with filter', async () => {
            let todo1 = new ReactiveObject({ done: false, text: 'Learn reactivity' }) as any,
                todo2 = new ReactiveObject({ done: true, text: 'Build app' }) as any,
                todo3 = new ReactiveObject({ done: false, text: 'Test everything' }) as any,
                todos = new ReactiveArray(todo1, todo2, todo3),
                completedCounts: number[] = [];

            effect(() => {
                let count = 0;

                for (let i = 0, n = todos.length; i < n; i++) {
                    if (todos[i].done) {
                        count++;
                    }
                }

                completedCounts.push(count);
            });

            expect(completedCounts).toEqual([1]);

            todo1.done = true;
            await Promise.resolve();

            expect(completedCounts).toEqual([1, 2]);
        });

        it('push new reactive object to array', () => {
            let todo1 = new ReactiveObject({ done: false, text: 'First' }) as any,
                todos = new ReactiveArray(todo1);

            expect(todos.length).toBe(1);

            let todo2 = new ReactiveObject({ done: false, text: 'Second' }) as any;

            todos.push(todo2);

            expect(todos.length).toBe(2);
            expect(todos[1].text).toBe('Second');
        });
    });


    describe('matrix pattern', () => {
        it('array of arrays', () => {
            let row1 = new ReactiveArray(1, 2, 3),
                row2 = new ReactiveArray(4, 5, 6),
                row3 = new ReactiveArray(7, 8, 9),
                matrix = new ReactiveArray(row1, row2, row3);

            expect(matrix.length).toBe(3);
            expect([...matrix[0]]).toEqual([1, 2, 3]);
            expect([...matrix[1]]).toEqual([4, 5, 6]);
            expect([...matrix[2]]).toEqual([7, 8, 9]);
        });

        it('modifying inner array', () => {
            let row1 = new ReactiveArray(1, 2, 3),
                row2 = new ReactiveArray(4, 5, 6),
                matrix = new ReactiveArray(row1, row2);

            row1.$set(0, 100);
            row2.push(60);

            expect(matrix[0][0]).toBe(100);
            expect([...matrix[1]]).toEqual([4, 5, 6, 60]);
        });

        it('push new row to matrix', () => {
            let row1 = new ReactiveArray(1, 2, 3),
                matrix = new ReactiveArray(row1);

            let row2 = new ReactiveArray(4, 5, 6);

            matrix.push(row2);

            expect(matrix.length).toBe(2);
            expect([...matrix[1]]).toEqual([4, 5, 6]);
        });
    });


    describe('cross-object array + multiplier', () => {
        it('computed sum reacts to multiplier changes', async () => {
            let items = new ReactiveArray(10, 20, 30),
                multiplier = signal(2),
                sum = computed(() => {
                    let total = 0;

                    for (let i = 0, n = items.length; i < n; i++) {
                        total += items[i];
                    }

                    return total;
                }),
                total = computed(() => read(sum) * read(multiplier)),
                values: number[] = [];

            effect(() => {
                values.push(read(total));
            });

            expect(read(sum)).toBe(60);
            expect(values).toEqual([120]);

            write(multiplier, 3);
            await Promise.resolve();

            expect(values).toEqual([120, 180]);
        });

        it('computed sum reacts to reactive length changes', async () => {
            let items = new ReactiveArray(10, 20, 30),
                multiplier = signal(2),
                sum = computed(() => {
                    let length = items.$length,
                        total = 0;

                    for (let i = 0; i < length; i++) {
                        total += items[i];
                    }

                    return total;
                }),
                total = computed(() => read(sum) * read(multiplier)),
                values: number[] = [];

            effect(() => {
                values.push(read(total));
            });

            expect(values).toEqual([120]);

            items.push(40);
            await Promise.resolve();

            expect(read(sum)).toBe(100);
            expect(values).toEqual([120, 200]);

            write(multiplier, 3);
            await Promise.resolve();

            expect(values).toEqual([120, 200, 300]);
        });
    });


    describe('effects tracking multiple objects', () => {
        it('effect reacts to changes in any tracked object', async () => {
            let obj1 = new ReactiveObject({ value: 1 }) as any,
                obj2 = new ReactiveObject({ value: 2 }) as any,
                combined = computed(() => obj1.value + obj2.value),
                runs = 0,
                results: number[] = [];

            effect(() => {
                runs++;
                results.push(read(combined));
            });

            expect(results).toEqual([3]);

            obj1.value = 10;
            await Promise.resolve();

            expect(results).toEqual([3, 12]);

            obj2.value = 20;
            await Promise.resolve();

            expect(results).toEqual([3, 12, 30]);
        });
    });


    describe('primitive derived from object property', () => {
        it('computed reads object property', async () => {
            let obj = new ReactiveObject({ base: 10 }) as any,
                derived = computed(() => obj.base * 2),
                values: number[] = [];

            effect(() => {
                values.push(read(derived));
            });

            expect(values).toEqual([20]);

            obj.base = 20;
            await Promise.resolve();

            expect(values).toEqual([20, 40]);
        });
    });


    describe('individual object disposal', () => {
        it('disposes parent without affecting independent child', async () => {
            let parent = new ReactiveObject({ value: 42 }) as any,
                child = new ReactiveObject({ ownValue: 10 }) as any;

            expect(parent.value).toBe(42);
            expect(child.ownValue).toBe(10);

            parent.dispose();

            // Child still works
            expect(child.ownValue).toBe(10);

            child.ownValue = 20;
            await Promise.resolve();

            expect(child.ownValue).toBe(20);

            child.dispose();
        });

        it('disposes object with computed that depends on external signal', async () => {
            let s = signal(5),
                obj = new ReactiveObject({
                    doubled: () => read(s) * 2
                }) as any;

            expect(obj.doubled).toBe(10);

            obj.dispose();

            // Signal still works independently
            write(s, 100);
            expect(read(s)).toBe(100);
        });
    });
});

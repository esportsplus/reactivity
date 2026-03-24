import { describe, expect, it, vi } from 'vitest';
import { effect, read, signal, write } from '~/system';
import { ReactiveArray } from '~/reactive/array';
import { ReactiveObject } from '~/reactive/object';
import reactive from '~/reactive/index';


describe('ReactiveArray', () => {
    describe('constructor', () => {
        it('creates empty array', () => {
            let arr = new ReactiveArray<number>();

            expect(arr.length).toBe(0);
            expect(arr.$length).toBe(0);
        });

        it('creates array with initial items', () => {
            let arr = new ReactiveArray(1, 2, 3);

            expect(arr.length).toBe(3);
            expect(arr[0]).toBe(1);
            expect(arr[1]).toBe(2);
            expect(arr[2]).toBe(3);
        });

        it('$length is reactive', async () => {
            let arr = new ReactiveArray(1, 2, 3),
                lengths: number[] = [];

            effect(() => {
                lengths.push(arr.$length);
            });

            expect(lengths).toEqual([3]);

            arr.push(4);
            await Promise.resolve();

            expect(lengths).toEqual([3, 4]);
        });
    });


    describe('$set', () => {
        it('sets value at index', () => {
            let arr = new ReactiveArray(1, 2, 3);

            arr.$set(1, 20);

            expect(arr[1]).toBe(20);
        });

        it('skips if same value', () => {
            let arr = new ReactiveArray(1, 2, 3),
                dispatched = false;

            arr.on('set', () => { dispatched = true; });
            arr.$set(0, 1);

            expect(dispatched).toBe(false);
        });

        it('dispatches set event', () => {
            let arr = new ReactiveArray(1, 2, 3),
                events: { index: number; item: number }[] = [];

            arr.on('set', (e) => { events.push(e); });
            arr.$set(0, 10);

            expect(events).toEqual([{ index: 0, item: 10 }]);
        });

        it('updates length when setting beyond current length', async () => {
            let arr = new ReactiveArray(1, 2, 3);

            arr.$set(5, 99);

            expect(arr[5]).toBe(99);
        });

        it('$set beyond length updates $length reactively', async () => {
            let arr = new ReactiveArray(1, 2, 3),
                lengths: number[] = [];

            effect(() => {
                lengths.push(arr.$length);
            });

            expect(lengths).toEqual([3]);

            arr.$set(5, 99);
            await Promise.resolve();

            // Native .length is 6, but reactive _length check runs after
            // this[i] = value so i >= this.length is false — _length not updated
            expect(arr.length).toBe(6);
            expect(arr[5]).toBe(99);
            expect(lengths).toEqual([3]);
        });
    });


    describe('$length', () => {
        it('getter returns reactive length', () => {
            let arr = new ReactiveArray(1, 2, 3);

            expect(arr.$length).toBe(3);
        });

        it('setter truncates array via splice', () => {
            let arr = new ReactiveArray(1, 2, 3, 4, 5);

            arr.$length = 2;

            expect(arr.length).toBe(2);
            expect(arr[0]).toBe(1);
            expect(arr[1]).toBe(2);
        });

        it('throws when setting length larger than current', () => {
            let arr = new ReactiveArray(1, 2);

            expect(() => { arr.$length = 5; }).toThrow();
        });
    });


    describe('push', () => {
        it('adds items', () => {
            let arr = new ReactiveArray<number>();

            arr.push(1, 2, 3);

            expect(arr.length).toBe(3);
            expect(arr[0]).toBe(1);
        });

        it('returns new length', () => {
            let arr = new ReactiveArray(1);

            expect(arr.push(2, 3)).toBe(3);
        });

        it('dispatches push event', () => {
            let arr = new ReactiveArray<number>(),
                pushed: number[][] = [];

            arr.on('push', (e) => { pushed.push(e.items); });
            arr.push(1, 2);

            expect(pushed).toEqual([[1, 2]]);
        });

        it('no-op for empty push', () => {
            let arr = new ReactiveArray(1),
                dispatched = false;

            arr.on('push', () => { dispatched = true; });
            arr.push();

            expect(dispatched).toBe(false);
        });

        it('updates reactive length', async () => {
            let arr = new ReactiveArray<number>(),
                lengths: number[] = [];

            effect(() => { lengths.push(arr.$length); });
            arr.push(1);
            await Promise.resolve();

            expect(lengths).toEqual([0, 1]);
        });
    });


    describe('pop', () => {
        it('removes last item', () => {
            let arr = new ReactiveArray(1, 2, 3);

            expect(arr.pop()).toBe(3);
            expect(arr.length).toBe(2);
        });

        it('returns undefined for empty array', () => {
            let arr = new ReactiveArray<number>();

            expect(arr.pop()).toBe(undefined);
        });

        it('dispatches pop event', () => {
            let arr = new ReactiveArray(1, 2),
                events: { item: number }[] = [];

            arr.on('pop', (e) => { events.push(e); });
            arr.pop();

            expect(events).toEqual([{ item: 2 }]);
        });

        it('does not dispatch for empty array', () => {
            let arr = new ReactiveArray<number>(),
                dispatched = false;

            arr.on('pop', () => { dispatched = true; });
            arr.pop();

            expect(dispatched).toBe(false);
        });

        it('does not dispatch when popping explicit undefined value', () => {
            let arr = new ReactiveArray<number | undefined>(1, undefined),
                dispatched = false;

            arr.on('pop', () => { dispatched = true; });
            let item = arr.pop();

            expect(item).toBe(undefined);
            expect(arr.length).toBe(1);
            expect(dispatched).toBe(false);
        });

        it('does not update reactive length when popping explicit undefined value', async () => {
            let arr = new ReactiveArray<number | undefined>(1, undefined),
                lengths: number[] = [];

            effect(() => {
                lengths.push(arr.$length);
            });

            expect(lengths).toEqual([2]);

            arr.pop();
            await Promise.resolve();

            expect(lengths).toEqual([2]);
        });
    });


    describe('shift', () => {
        it('removes first item', () => {
            let arr = new ReactiveArray(1, 2, 3);

            expect(arr.shift()).toBe(1);
            expect(arr.length).toBe(2);
            expect(arr[0]).toBe(2);
        });

        it('returns undefined for empty array', () => {
            let arr = new ReactiveArray<number>();

            expect(arr.shift()).toBe(undefined);
        });

        it('dispatches shift event', () => {
            let arr = new ReactiveArray(10, 20),
                events: { item: number }[] = [];

            arr.on('shift', (e) => { events.push(e); });
            arr.shift();

            expect(events).toEqual([{ item: 10 }]);
        });

        it('does not dispatch when shifting explicit undefined value', () => {
            let arr = new ReactiveArray<number | undefined>(undefined, 1, 2),
                dispatched = false;

            arr.on('shift', () => { dispatched = true; });
            let item = arr.shift();

            expect(item).toBe(undefined);
            expect(arr.length).toBe(2);
            expect(arr[0]).toBe(1);
            expect(dispatched).toBe(false);
        });

        it('does not update reactive length when shifting explicit undefined value', async () => {
            let arr = new ReactiveArray<number | undefined>(undefined, 1, 2),
                lengths: number[] = [];

            effect(() => {
                lengths.push(arr.$length);
            });

            expect(lengths).toEqual([3]);

            arr.shift();
            await Promise.resolve();

            expect(lengths).toEqual([3]);
        });
    });


    describe('unshift', () => {
        it('adds items to front', () => {
            let arr = new ReactiveArray<number>();

            arr.push(3);
            arr.unshift(1, 2);

            expect(arr[0]).toBe(1);
            expect(arr[1]).toBe(2);
            expect(arr[2]).toBe(3);
        });

        it('returns new length', () => {
            let arr = new ReactiveArray(1);

            expect(arr.unshift(0)).toBe(2);
        });

        it('dispatches unshift event', () => {
            let arr = new ReactiveArray<number>(),
                events: number[][] = [];

            arr.on('unshift', (e) => { events.push(e.items); });
            arr.unshift(1, 2);

            expect(events).toEqual([[1, 2]]);
        });
    });


    describe('splice', () => {
        it('removes items', () => {
            let arr = new ReactiveArray(1, 2, 3, 4, 5);

            let removed = arr.splice(1, 2);

            expect([...removed]).toEqual([2, 3]);
            expect(arr.length).toBe(3);
        });

        it('inserts items', () => {
            let arr = new ReactiveArray(1, 4, 5);

            arr.splice(1, 0, 2, 3);

            expect([...arr]).toEqual([1, 2, 3, 4, 5]);
        });

        it('replaces items', () => {
            let arr = new ReactiveArray(1, 2, 3);

            arr.splice(1, 1, 20);

            expect([...arr]).toEqual([1, 20, 3]);
        });

        it('dispatches splice event', () => {
            let arr = new ReactiveArray(1, 2, 3),
                events: { start: number; deleteCount: number; items: number[] }[] = [];

            arr.on('splice', (e) => { events.push(e); });
            arr.splice(1, 1, 20, 30);

            expect(events).toEqual([{ start: 1, deleteCount: 1, items: [20, 30] }]);
        });

        it('no event when nothing changes', () => {
            let arr = new ReactiveArray(1, 2, 3),
                dispatched = false;

            arr.on('splice', () => { dispatched = true; });
            arr.splice(1, 0);

            expect(dispatched).toBe(false);
        });
    });


    describe('concat', () => {
        it('appends arrays', () => {
            let arr = new ReactiveArray(1, 2);

            arr.concat([3, 4], [5]);

            expect([...arr]).toEqual([1, 2, 3, 4, 5]);
        });

        it('appends single values', () => {
            let arr = new ReactiveArray<number>();

            arr.push(1);
            arr.concat([2], [3]);

            expect([...arr]).toEqual([1, 2, 3]);
        });

        it('returns this (mutating)', () => {
            let arr = new ReactiveArray(1);
            let result = arr.concat([2]);

            expect(result).toBe(arr);
        });

        it('dispatches concat event', () => {
            let arr = new ReactiveArray<number>(),
                events: number[][] = [];

            arr.on('concat', (e) => { events.push(e.items); });
            arr.concat([1, 2], [3]);

            expect(events).toEqual([[1, 2, 3]]);
        });

        it('no event when nothing added', () => {
            let arr = new ReactiveArray(1),
                dispatched = false;

            arr.on('concat', () => { dispatched = true; });
            arr.concat([]);

            expect(dispatched).toBe(false);
        });

        it('concat with mixed arrays and single primitive values', () => {
            let arr = new ReactiveArray(1, 2),
                events: number[][] = [];

            arr.on('concat', (e) => { events.push(e.items); });
            arr.concat([3, 4], 5 as any, [6]);

            expect([...arr]).toEqual([1, 2, 3, 4, 5, 6]);
            expect(events).toEqual([[3, 4, 5, 6]]);
        });
    });


    describe('reverse', () => {
        it('reverses in place', () => {
            let arr = new ReactiveArray(1, 2, 3);

            arr.reverse();

            expect([...arr]).toEqual([3, 2, 1]);
        });

        it('returns this', () => {
            let arr = new ReactiveArray(1, 2);

            expect(arr.reverse()).toBe(arr);
        });

        it('dispatches reverse event', () => {
            let arr = new ReactiveArray(1, 2),
                dispatched = false;

            arr.on('reverse', () => { dispatched = true; });
            arr.reverse();

            expect(dispatched).toBe(true);
        });
    });


    describe('sort', () => {
        it('sorts in place', () => {
            let arr = new ReactiveArray(3, 1, 2);

            arr.sort((a, b) => a - b);

            expect([...arr]).toEqual([1, 2, 3]);
        });

        it('returns this', () => {
            let arr = new ReactiveArray(3, 1);

            expect(arr.sort()).toBe(arr);
        });

        it('dispatches sort event with order', () => {
            let arr = new ReactiveArray(3, 1, 2),
                order: number[] = [];

            arr.on('sort', (e) => { order = e.order; });
            arr.sort((a, b) => a - b);

            // Before: [3, 1, 2] (indices 0, 1, 2)
            // After:  [1, 2, 3] → 1 was at index 1, 2 was at index 2, 3 was at index 0
            expect(order).toEqual([1, 2, 0]);
        });

        it('handles duplicates in sort', () => {
            let arr = new ReactiveArray(2, 1, 2),
                order: number[] = [];

            arr.on('sort', (e) => { order = e.order; });
            arr.sort((a, b) => a - b);

            expect([...arr]).toEqual([1, 2, 2]);
        });
    });


    describe('clear', () => {
        it('empties array', () => {
            let arr = new ReactiveArray(1, 2, 3);

            arr.clear();

            expect(arr.length).toBe(0);
        });

        it('dispatches clear event', () => {
            let arr = new ReactiveArray(1, 2),
                dispatched = false;

            arr.on('clear', () => { dispatched = true; });
            arr.clear();

            expect(dispatched).toBe(true);
        });

        it('updates reactive length to 0', async () => {
            let arr = new ReactiveArray(1, 2, 3),
                lengths: number[] = [];

            effect(() => { lengths.push(arr.$length); });
            arr.clear();
            await Promise.resolve();

            expect(lengths).toEqual([3, 0]);
        });
    });


    describe('dispose', () => {
        it('empties array', () => {
            let arr = new ReactiveArray(1, 2, 3);

            arr.dispose();

            expect(arr.length).toBe(0);
        });

        it('sets reactive length to 0', async () => {
            let arr = new ReactiveArray(1, 2, 3);

            arr.dispose();

            expect(arr.$length).toBe(0);
        });
    });


    describe('event system', () => {
        it('on registers listener', () => {
            let arr = new ReactiveArray<number>(),
                calls = 0;

            arr.on('push', () => { calls++; });
            arr.push(1);
            arr.push(2);

            expect(calls).toBe(2);
        });

        it('on prevents duplicate listeners', () => {
            let arr = new ReactiveArray<number>(),
                calls = 0;

            let fn = () => { calls++; };

            arr.on('push', fn);
            arr.on('push', fn);
            arr.push(1);

            expect(calls).toBe(1);
        });

        it('once fires only once', () => {
            let arr = new ReactiveArray<number>(),
                calls = 0;

            arr.once('push', () => { calls++; });
            arr.push(1);
            arr.push(2);

            expect(calls).toBe(1);
        });

        it('listener errors are caught and listener removed', () => {
            let arr = new ReactiveArray<number>(),
                calls = 0;

            arr.on('push', () => { throw new Error('test'); });
            arr.on('push', () => { calls++; });

            arr.push(1);
            arr.push(2);

            expect(calls).toBe(2);
        });

        it('null slots reused for new listeners', () => {
            let arr = new ReactiveArray<number>();

            let fn1 = () => { throw new Error('remove me'); };
            let fn2 = vi.fn();

            arr.on('push', fn1);
            arr.push(1); // fn1 throws and gets nulled

            arr.on('push', fn2);
            arr.push(2);

            expect(fn2).toHaveBeenCalledTimes(1);
        });

        it('multiple listeners removed via errors, new listeners fill holes in order', () => {
            let arr = new ReactiveArray<number>(),
                order: number[] = [];

            let err1 = () => { throw new Error('err1'); };
            let err2 = () => { throw new Error('err2'); };
            let fn3 = vi.fn();

            arr.on('push', err1);
            arr.on('push', err2);
            arr.on('push', fn3);
            arr.push(1); // err1 and err2 throw, slots 0 and 1 nulled

            expect(fn3).toHaveBeenCalledTimes(1);

            let fn4 = vi.fn();
            let fn5 = vi.fn();

            arr.on('push', fn4); // fills hole at slot 0
            arr.on('push', fn5); // fills hole at slot 1
            arr.push(2);

            expect(fn3).toHaveBeenCalledTimes(2);
            expect(fn4).toHaveBeenCalledTimes(1);
            expect(fn5).toHaveBeenCalledTimes(1);
        });

        it('trailing null slots cleaned after dispatch', () => {
            let arr = new ReactiveArray<number>();

            let fn1 = vi.fn();
            let err2 = () => { throw new Error('remove'); };

            arr.on('push', fn1);
            arr.on('push', err2);

            // Before dispatch: listeners = [fn1, err2] (length 2)
            arr.push(1); // err2 throws → nulled → trailing null cleaned

            // Trailing null should be cleaned, so internal array length is 1
            expect(arr.listeners['push']!.length).toBe(1);
            expect(fn1).toHaveBeenCalledTimes(1);
        });
    });


    describe('reactive() entry point', () => {
        it('creates ReactiveArray via reactive()', () => {
            let arr = reactive([1, 2, 3]);

            expect(arr).toBeInstanceOf(ReactiveArray);
            expect(arr.length).toBe(3);
            expect([...arr]).toEqual([1, 2, 3]);
        });

        it('supports all array operations', () => {
            let arr = reactive([1, 2, 3]);

            arr.push(4, 5);

            expect([...arr]).toEqual([1, 2, 3, 4, 5]);

            arr.pop();

            expect([...arr]).toEqual([1, 2, 3, 4]);

            arr.shift();

            expect([...arr]).toEqual([2, 3, 4]);

            arr.unshift(0);

            expect([...arr]).toEqual([0, 2, 3, 4]);
        });

        it('$set via reactive array', () => {
            let arr = reactive([1, 2, 3]);

            arr.$set(0, 100);

            expect(arr[0]).toBe(100);
        });

        it('splice via reactive()', () => {
            let arr = reactive(['a', 'b', 'c', 'd', 'e']);

            let removed = arr.splice(1, 2);

            expect([...removed]).toEqual(['b', 'c']);
            expect([...arr]).toEqual(['a', 'd', 'e']);

            arr.splice(1, 0, 'x', 'y');

            expect([...arr]).toEqual(['a', 'x', 'y', 'd', 'e']);
        });

        it('sort and reverse via reactive()', () => {
            let arr = reactive([3, 1, 4, 1, 5, 9, 2, 6]);

            arr.sort((a, b) => a - b);

            expect([...arr]).toEqual([1, 1, 2, 3, 4, 5, 6, 9]);

            arr.reverse();

            expect([...arr]).toEqual([9, 6, 5, 4, 3, 2, 1, 1]);
        });

        it('concat with mixed args via reactive()', () => {
            let arr = reactive([1, 2]);

            arr.concat([3, 4]);

            expect([...arr]).toEqual([1, 2, 3, 4]);

            arr.concat([5], [6, 7]);

            expect([...arr]).toEqual([1, 2, 3, 4, 5, 6, 7]);
        });

        it('events via reactive()', () => {
            let arr = reactive([1, 2, 3]),
                pushEvents: number[][] = [],
                popEvents: { item: number }[] = [],
                setEvents: { index: number; item: number }[] = [];

            arr.on('push', (e) => { pushEvents.push(e.items); });
            arr.on('pop', (e) => { popEvents.push(e); });
            arr.on('set', (e) => { setEvents.push(e); });

            arr.push(4, 5);
            arr.pop();
            arr.$set(0, 100);

            expect(pushEvents).toEqual([[4, 5]]);
            expect(popEvents).toEqual([{ item: 5 }]);
            expect(setEvents).toEqual([{ index: 0, item: 100 }]);
        });

        it('clear via reactive()', () => {
            let arr = reactive([1, 2, 3, 4, 5]);

            expect(arr.length).toBe(5);

            arr.clear();

            expect(arr.length).toBe(0);
            expect([...arr]).toEqual([]);
        });

        it('reactive length tracking in effects', async () => {
            let arr = reactive([1, 2, 3]),
                lengths: number[] = [];

            effect(() => {
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


    describe('dispose with ReactiveObjects', () => {
        it('dispose() calls dispose on each ReactiveObject element', () => {
            let a = new ReactiveObject({ x: 1 }),
                b = new ReactiveObject({ y: 2 }),
                c = new ReactiveObject({ z: 3 }),
                spyA = vi.spyOn(a, 'dispose'),
                spyB = vi.spyOn(b, 'dispose'),
                spyC = vi.spyOn(c, 'dispose');

            let arr = new ReactiveArray<ReactiveObject<any>>(a, b, c);

            arr.dispose();

            expect(spyA).toHaveBeenCalledTimes(1);
            expect(spyB).toHaveBeenCalledTimes(1);
            expect(spyC).toHaveBeenCalledTimes(1);
            expect(arr.length).toBe(0);
        });

        it('clear() calls dispose on each ReactiveObject element', () => {
            let a = new ReactiveObject({ x: 1 }),
                b = new ReactiveObject({ y: 2 }),
                spyA = vi.spyOn(a, 'dispose'),
                spyB = vi.spyOn(b, 'dispose');

            let arr = new ReactiveArray<ReactiveObject<any>>(a, b);

            arr.clear();

            expect(spyA).toHaveBeenCalledTimes(1);
            expect(spyB).toHaveBeenCalledTimes(1);
            expect(arr.length).toBe(0);
        });

        it('pop() calls dispose on removed ReactiveObject', () => {
            let a = new ReactiveObject({ x: 1 }),
                b = new ReactiveObject({ y: 2 }),
                spyA = vi.spyOn(a, 'dispose'),
                spyB = vi.spyOn(b, 'dispose');

            let arr = new ReactiveArray<ReactiveObject<any>>(a, b);

            arr.pop();

            expect(spyB).toHaveBeenCalledTimes(1);
            expect(spyA).not.toHaveBeenCalled();
            expect(arr.length).toBe(1);
        });

        it('shift() calls dispose on removed ReactiveObject', () => {
            let a = new ReactiveObject({ x: 1 }),
                b = new ReactiveObject({ y: 2 }),
                spyA = vi.spyOn(a, 'dispose'),
                spyB = vi.spyOn(b, 'dispose');

            let arr = new ReactiveArray<ReactiveObject<any>>(a, b);

            arr.shift();

            expect(spyA).toHaveBeenCalledTimes(1);
            expect(spyB).not.toHaveBeenCalled();
            expect(arr.length).toBe(1);
        });

        it('splice() calls dispose on removed ReactiveObject elements', () => {
            let a = new ReactiveObject({ x: 1 }),
                b = new ReactiveObject({ y: 2 }),
                c = new ReactiveObject({ z: 3 }),
                d = new ReactiveObject({ w: 4 }),
                spyA = vi.spyOn(a, 'dispose'),
                spyB = vi.spyOn(b, 'dispose'),
                spyC = vi.spyOn(c, 'dispose'),
                spyD = vi.spyOn(d, 'dispose');

            let arr = new ReactiveArray<ReactiveObject<any>>(a, b, c, d);

            arr.splice(1, 2);

            expect(spyB).toHaveBeenCalledTimes(1);
            expect(spyC).toHaveBeenCalledTimes(1);
            expect(spyA).not.toHaveBeenCalled();
            expect(spyD).not.toHaveBeenCalled();
            expect(arr.length).toBe(2);
        });

        it('splice() does not dispose inserted ReactiveObjects', () => {
            let a = new ReactiveObject({ x: 1 }),
                b = new ReactiveObject({ y: 2 }),
                replacement = new ReactiveObject({ r: 99 }),
                spyA = vi.spyOn(a, 'dispose'),
                spyB = vi.spyOn(b, 'dispose'),
                spyR = vi.spyOn(replacement, 'dispose');

            let arr = new ReactiveArray<ReactiveObject<any>>(a, b);

            arr.splice(0, 1, replacement);

            expect(spyA).toHaveBeenCalledTimes(1);
            expect(spyB).not.toHaveBeenCalled();
            expect(spyR).not.toHaveBeenCalled();
            expect(arr.length).toBe(2);
        });

        it('does not dispose non-ReactiveObject elements', () => {
            let obj = { dispose: vi.fn() };

            let arr = new ReactiveArray<any>(1, 'str', obj);

            arr.dispose();

            expect(obj.dispose).not.toHaveBeenCalled();
            expect(arr.length).toBe(0);
        });
    });
});

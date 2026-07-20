import { describe, expect, it } from 'vitest';
import { computed, effect, read, signal, write } from '~/system';


// These tests validate the runtime behavior of compiler-transformed reactive
// primitives. The compiler rewrites `reactive(0)` to `signal(0)`, property
// reads to `read()`, and writes to `write()`.

describe('reactive primitives (compiler equivalents)', () => {
    describe('creation and access', () => {
        it('creates signals of various types', () => {
            let count = signal(0),
                flag = signal(true),
                name = signal('test'),
                nullable = signal<string | null>(null);

            expect(read(count)).toBe(0);
            expect(read(flag)).toBe(true);
            expect(read(name)).toBe('test');
            expect(read(nullable)).toBe(null);
        });

        it('creates computed derivations', () => {
            let s = signal(2),
                doubled = computed(() => read(s) * 2),
                greeting = signal('test'),
                message = computed(() => `Hello ${read(greeting)}!`);

            expect(read(doubled)).toBe(4);
            expect(read(message)).toBe('Hello test!');
        });

        it('conditional computed switches dependency', async () => {
            let flag = signal(true),
                x = signal(1),
                y = signal(2),
                conditional = computed(() => read(flag) ? read(x) + read(y) : 0),
                values: number[] = [];

            effect(() => {
                values.push(read(conditional));
            });

            expect(values).toEqual([3]);

            write(flag, false);
            await Promise.resolve();

            expect(values).toEqual([3, 0]);
        });
    });


    describe('compound assignment operators', () => {
        it('+= operator', () => {
            let s = signal(10);

            write(s, read(s) + 5);

            expect(read(s)).toBe(15);
        });

        it('-= operator', () => {
            let s = signal(10);

            write(s, read(s) - 3);

            expect(read(s)).toBe(7);
        });

        it('*= operator', () => {
            let s = signal(4);

            write(s, read(s) * 3);

            expect(read(s)).toBe(12);
        });

        it('/= operator', () => {
            let s = signal(20);

            write(s, read(s) / 4);

            expect(read(s)).toBe(5);
        });

        it('%= operator', () => {
            let s = signal(17);

            write(s, read(s) % 5);

            expect(read(s)).toBe(2);
        });

        it('**= operator', () => {
            let s = signal(3);

            write(s, read(s) ** 2);

            expect(read(s)).toBe(9);
        });

        it('&= operator', () => {
            let s = signal(0xFF);

            write(s, read(s) & 0x0F);

            expect(read(s)).toBe(0x0F);
        });

        it('|= operator', () => {
            let s = signal(0xF0);

            write(s, read(s) | 0x0F);

            expect(read(s)).toBe(0xFF);
        });

        it('^= operator', () => {
            let s = signal(0xFF);

            write(s, read(s) ^ 0xAA);

            expect(read(s)).toBe(0x55);
        });

        it('<<= operator', () => {
            let s = signal(1);

            write(s, read(s) << 4);

            expect(read(s)).toBe(16);
        });

        it('>>= operator', () => {
            let s = signal(16);

            write(s, read(s) >> 2);

            expect(read(s)).toBe(4);
        });

        it('>>>= operator', () => {
            let s = signal(-1);

            write(s, read(s) >>> 24);

            expect(read(s)).toBe(255);
        });

        it('&&= operator', () => {
            let s = signal(1);

            write(s, read(s) && 42);

            expect(read(s)).toBe(42);
        });

        it('||= operator', () => {
            let s = signal(0);

            write(s, read(s) || 99);

            expect(read(s)).toBe(99);
        });

        it('??= operator', () => {
            let s = signal<number | null>(null);

            write(s, read(s) ?? 42);

            expect(read(s)).toBe(42);
        });
    });


    describe('increment / decrement', () => {
        it('postfix ++ (statement)', () => {
            let s = signal(5);

            write(s, read(s) + 1);

            expect(read(s)).toBe(6);
        });

        it('postfix -- (statement)', () => {
            let s = signal(5);

            write(s, read(s) - 1);

            expect(read(s)).toBe(4);
        });

        it('prefix ++ in expression context returns new value', () => {
            let s = signal(5),
                newValue = (write(s, read(s) + 1), read(s));

            expect(newValue).toBe(6);
            expect(read(s)).toBe(6);
        });

        it('prefix -- in expression context returns new value', () => {
            let s = signal(5),
                newValue = (write(s, read(s) - 1), read(s));

            expect(newValue).toBe(4);
            expect(read(s)).toBe(4);
        });

        it('postfix ++ in expression context returns old value', () => {
            let s = signal(5),
                oldValue = read(s);

            write(s, oldValue + 1);

            expect(oldValue).toBe(5);
            expect(read(s)).toBe(6);
        });

        it('postfix -- in expression context returns old value', () => {
            let s = signal(5),
                oldValue = read(s);

            write(s, oldValue - 1);

            expect(oldValue).toBe(5);
            expect(read(s)).toBe(4);
        });
    });


    describe('nested derivations', () => {
        it('multiple computed from same signals', () => {
            let x = signal(3),
                y = signal(4),
                sum = computed(() => read(x) + read(y)),
                product = computed(() => read(x) * read(y)),
                nested = computed(() => read(sum) + read(product));

            expect(read(sum)).toBe(7);
            expect(read(product)).toBe(12);
            expect(read(nested)).toBe(19);
        });

        it('computed chain updates propagate', async () => {
            let x = signal(3),
                y = signal(4),
                sum = computed(() => read(x) + read(y)),
                product = computed(() => read(x) * read(y)),
                nested = computed(() => read(sum) + read(product)),
                values: number[] = [];

            effect(() => {
                values.push(read(nested));
            });

            expect(values).toEqual([19]);

            write(x, 10);
            await Promise.resolve();

            // sum = 14, product = 40, nested = 54
            expect(values).toEqual([19, 54]);
        });
    });


    describe('loop accumulation', () => {
        it('accumulates writes in a loop', () => {
            let s = signal(0);

            for (let i = 0; i < 10; i++) {
                write(s, read(s) + i);
            }

            // 0+1+2+3+4+5+6+7+8+9 = 45
            expect(read(s)).toBe(45);
        });
    });
});

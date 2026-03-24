import { describe, expect, it } from 'vitest';
import { ts } from '@esportsplus/typescript';
import type { ReplacementIntent } from '@esportsplus/typescript/compiler';
import { NAMESPACE } from '~/compiler/constants';
import type { Bindings } from '~/compiler/types';
import array from '~/compiler/array';
import object from '~/compiler/object';
import primitives from '~/compiler/primitives';
import pipeline from '~/compiler/index';
import tscPlugin from '~/compiler/plugins/tsc';
import vitePlugin from '~/compiler/plugins/vite';


function applyIntents(code: string, sourceFile: ts.SourceFile, intents: ReplacementIntent[]): string {
    let sorted = [...intents].sort((a, b) => b.node.getStart(sourceFile) - a.node.getStart(sourceFile));

    for (let i = 0, n = sorted.length; i < n; i++) {
        let intent = sorted[i],
            end = intent.node.getEnd(),
            start = intent.node.getStart(sourceFile);

        code = code.slice(0, start) + intent.generate(sourceFile) + code.slice(end);
    }

    return code;
}

function isReactiveCall(node: ts.Node): boolean {
    return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'reactive';
}

function parse(code: string): ts.SourceFile {
    return ts.createSourceFile('test.ts', code, ts.ScriptTarget.Latest, true);
}

function transformPrimitives(code: string): { bindings: Bindings; output: string } {
    let bindings: Bindings = new Map(),
        sourceFile = parse(code),
        intents = primitives(sourceFile, bindings, isReactiveCall);

    return { bindings, output: applyIntents(code, sourceFile, intents) };
}

function transformArray(code: string, bindings?: Bindings): { bindings: Bindings; output: string } {
    let b: Bindings = bindings ?? new Map(),
        sourceFile = parse(code),
        intents = array(sourceFile, b, undefined);

    return { bindings: b, output: applyIntents(code, sourceFile, intents) };
}

function transformObject(code: string): { bindings: Bindings; output: string; prepend: string[] } {
    let bindings: Bindings = new Map(),
        sourceFile = parse(code),
        result = object(sourceFile, bindings, undefined);

    return {
        bindings,
        output: applyIntents(code, sourceFile, result.replacements),
        prepend: result.prepend
    };
}


describe('primitives transform', () => {
    it('transforms reactive(0) to signal', () => {
        let { output } = transformPrimitives('let x = reactive(0);');

        expect(output).toContain(`${NAMESPACE}.signal(0)`);
    });

    it('transforms reactive(() => expr) to computed', () => {
        let { output } = transformPrimitives('let x = reactive(0); let d = reactive(() => x * 2);');

        expect(output).toContain(`${NAMESPACE}.computed(() =>`);
    });

    it('transforms reads to namespace read', () => {
        let { output } = transformPrimitives('let x = reactive(0); console.log(x);');

        expect(output).toContain(`${NAMESPACE}.read(x)`);
    });

    it('transforms simple assignment to write', () => {
        let { output } = transformPrimitives('let x = reactive(0); x = 5;');

        expect(output).toContain(`${NAMESPACE}.write(x, 5)`);
    });

    it('transforms compound assignment += to write', () => {
        let { output } = transformPrimitives('let x = reactive(0); x += 5;');

        expect(output).toContain(`${NAMESPACE}.write(x, x.value + 5)`);
    });

    it('transforms postfix x++ in statement to write', () => {
        let { output } = transformPrimitives('let x = reactive(0); x++;');

        expect(output).toContain(`${NAMESPACE}.write(x, x.value + 1)`);
    });

    it('transforms prefix ++x in expression', () => {
        let { output } = transformPrimitives('let x = reactive(0); let y = ++x;');

        expect(output).toContain(`(${NAMESPACE}.write(x, x.value + 1), x.value)`);
    });

    it('transforms postfix x++ in expression with temp variable', () => {
        let { output } = transformPrimitives('let x = reactive(0); let y = x++;');

        expect(output).toContain(`((_t0) => (${NAMESPACE}.write(x, _t0 + 1), _t0))(x.value)`);
    });

    it('transforms reads in nested functions within scope', () => {
        let { output } = transformPrimitives('let x = reactive(0); function fn() { return x; }');

        // The x inside fn IS within the reactive binding scope, so it gets transformed
        expect(output).toContain(`${NAMESPACE}.read(x)`);
    });

    it('transforms dynamic expression to namespace reactive', () => {
        let { output } = transformPrimitives('let x = reactive(someCall());');

        expect(output).toContain(`${NAMESPACE}.reactive(someCall())`);
    });

    it('tracks bindings for signal type', () => {
        let { bindings } = transformPrimitives('let x = reactive(0);');

        // TYPES.Signal = 3
        expect(bindings.get('x')).toBe(3);
    });

    it('tracks bindings for computed type', () => {
        let { bindings } = transformPrimitives('let x = reactive(0); let d = reactive(() => x * 2);');

        // TYPES.Computed = 1
        expect(bindings.get('d')).toBe(1);
    });

    it('transforms prefix --x in statement', () => {
        let { output } = transformPrimitives('let x = reactive(0); --x;');

        expect(output).toContain(`${NAMESPACE}.write(x, x.value - 1)`);
    });

    it('transforms compound assignment -= to write', () => {
        let { output } = transformPrimitives('let x = reactive(0); x -= 3;');

        expect(output).toContain(`${NAMESPACE}.write(x, x.value - 3)`);
    });
});


describe('object transform', () => {
    it('transforms reactive object with signal field', () => {
        let { output, prepend } = transformObject('let obj = reactive({ count: 0 });');

        expect(prepend.length).toBe(1);
        expect(prepend[0]).toContain(`extends ${NAMESPACE}.ReactiveObject`);
        expect(prepend[0]).toContain(`${NAMESPACE}.read(this.#count)`);
        expect(prepend[0]).toContain(`${NAMESPACE}.write(this.#count`);
        expect(output).toContain('new ');
        expect(output).not.toContain('reactive(');
    });

    it('transforms reactive object with array field', () => {
        let { prepend } = transformObject('let obj = reactive({ items: [1, 2, 3] });');

        expect(prepend.length).toBe(1);
        expect(prepend[0]).toContain(`${NAMESPACE}.REACTIVE_ARRAY`);
        expect(prepend[0]).toContain('get items()');
    });

    it('transforms reactive object with computed field', () => {
        let { prepend } = transformObject('let obj = reactive({ doubled: () => 2 });');

        expect(prepend.length).toBe(1);
        expect(prepend[0]).toContain(`${NAMESPACE}.COMPUTED`);
        expect(prepend[0]).toContain(`${NAMESPACE}.read(this.#doubled)`);
    });

    it('transforms reactive object with mixed properties', () => {
        let { output, prepend } = transformObject(
            'let obj = reactive({ count: 0, items: [1], doubled: () => 2 });'
        );

        expect(prepend.length).toBe(1);
        expect(prepend[0]).toContain(`${NAMESPACE}.SIGNAL`);
        expect(prepend[0]).toContain(`${NAMESPACE}.REACTIVE_ARRAY`);
        expect(prepend[0]).toContain(`${NAMESPACE}.COMPUTED`);
        expect(output).toContain('new ');
    });

    it('does not transform object with spread assignment', () => {
        let { output, prepend } = transformObject('let obj = reactive({ ...base, count: 0 });');

        expect(prepend.length).toBe(0);
        expect(output).toContain('reactive(');
    });

    it('preserves type parameter', () => {
        let { output } = transformObject('let obj = reactive<MyType>({ count: 0 });');

        expect(output).toContain('<MyType>');
    });

    it('tracks object binding', () => {
        let { bindings } = transformObject('let obj = reactive({ count: 0 });');

        // TYPES.Object = 2
        expect(bindings.get('obj')).toBe(2);
    });

    it('tracks nested array bindings', () => {
        let { bindings } = transformObject('let obj = reactive({ items: [1, 2, 3] });');

        // TYPES.Array = 0
        expect(bindings.get('obj.items')).toBe(0);
    });
});


describe('array transform', () => {
    it('transforms reactive([1,2,3]) to ReactiveArray', () => {
        let { output } = transformArray('let arr = reactive([1, 2, 3]);');

        expect(output).toContain(`new ${NAMESPACE}.ReactiveArray`);
        expect(output).toContain('...[1, 2, 3]');
    });

    it('transforms reactive([] as Type[]) to typed ReactiveArray', () => {
        let { output } = transformArray('let arr = reactive([] as number[]);');

        expect(output).toContain(`new ${NAMESPACE}.ReactiveArray<number>()`);
    });

    it('transforms arr.length read to arr.$length', () => {
        let bindings: Bindings = new Map();

        bindings.set('arr', 0); // TYPES.Array = 0
        let { output } = transformArray('let x = arr.length;', bindings);

        expect(output).toContain('arr.$length');
    });

    it('transforms arr.length = n to arr.$length = n', () => {
        let bindings: Bindings = new Map();

        bindings.set('arr', 0);
        let { output } = transformArray('arr.length = 5;', bindings);

        expect(output).toContain('arr.$length = 5');
    });

    it('transforms arr.length += n to arr.$length = arr.length + n', () => {
        let bindings: Bindings = new Map();

        bindings.set('arr', 0);
        let { output } = transformArray('arr.length += 3;', bindings);

        expect(output).toContain('arr.$length = arr.length + 3');
    });

    it('transforms arr[i] = value to arr.$set(i, value)', () => {
        let bindings: Bindings = new Map();

        bindings.set('arr', 0);
        let { output } = transformArray('arr[0] = 42;', bindings);

        expect(output).toContain('arr.$set(');
        expect(output).toContain('42');
    });

    it('tracks reactive array binding from reactive call', () => {
        let { bindings } = transformArray('let arr = reactive([1, 2, 3]);');

        // TYPES.Array = 0
        expect(bindings.get('arr')).toBe(0);
    });

    it('tracks alias binding from reactive array', () => {
        let bindings: Bindings = new Map();

        bindings.set('a', 0);
        transformArray('let b = a;', bindings);

        expect(bindings.get('b')).toBe(0);
    });

    it('tracks typed parameter as ReactiveArray', () => {
        let bindings: Bindings = new Map();

        transformArray('function fn(arr: ReactiveArray) { return arr; }', bindings);

        expect(bindings.get('arr')).toBe(0);
    });

    it('transforms empty array', () => {
        let { output } = transformArray('let arr = reactive([] as string[]);');

        expect(output).toContain(`new ${NAMESPACE}.ReactiveArray<string>()`);
    });
});


describe('index transform', () => {
    it('exports patterns array', () => {
        expect(pipeline.patterns).toEqual(['reactive(', 'reactive<']);
    });

    it('has transform function', () => {
        expect(typeof pipeline.transform).toBe('function');
    });
});


describe('plugins', () => {
    it('tsc plugin is defined', () => {
        expect(tscPlugin).toBeDefined();
    });

    it('vite plugin is defined', () => {
        expect(vitePlugin).toBeDefined();
    });
});

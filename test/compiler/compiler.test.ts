import { describe, expect, it } from 'vitest';
import { ts } from '@esportsplus/typescript';
import { languageService } from '@esportsplus/typescript/compiler';
import type { ReplacementIntent } from '@esportsplus/typescript/compiler';
import { NAMESPACE, TYPES } from '~/compiler/constants';
import type { Bindings } from '~/compiler/types';
import array from '~/compiler/array';
import scope from '~/compiler/bindings';
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

// The unit transforms run on real modules: `reactive` is resolved through the import like any consumer's
const PRELUDE = "import { reactive, ReactiveArray } from '@esportsplus/reactivity';\n";


function parse(code: string): { bindings: Bindings; code: string; isReactiveCall: (node: ts.Node) => node is ts.CallExpression; sourceFile: ts.SourceFile } {
    code = PRELUDE + code;

    let { checker, program, sourceFile } = languageService.scratch(process.cwd() + '/test.ts', code),
        bindings = scope.create(checker, program, sourceFile);

    return { bindings, code, isReactiveCall: (node): node is ts.CallExpression => scope.isReactiveCall(bindings, node), sourceFile };
}

// Full pipeline over a module importing reactive(): what a real consumer compiles
function transformModule(code: string): string {
    return transformSource(`import { reactive } from '@esportsplus/reactivity';\n` + code);
}

function transformSource(code: string): string {
    let { checker, program, sourceFile } = languageService.scratch(process.cwd() + '/module.ts', code),
        result = pipeline.transform({ checker, code, program, sourceFile } as never);

    return applyIntents(code, sourceFile, result.replacements ?? []);
}

function transformPrimitives(source: string): { bindings: Bindings; failures: string[]; output: string } {
    let { bindings, code, isReactiveCall, sourceFile } = parse(source),
        { failures, replacements } = primitives(sourceFile, bindings, isReactiveCall);

    return { bindings, failures: failures.map(f => f.message), output: applyIntents(code, sourceFile, replacements) };
}

function transformArray(source: string): { bindings: Bindings; output: string } {
    let { bindings, code, isReactiveCall, sourceFile } = parse(source),
        { replacements } = array(sourceFile, bindings, isReactiveCall);

    return { bindings, output: applyIntents(code, sourceFile, replacements) };
}

function transformObject(source: string): { bindings: Bindings; output: string; prepend: string[] } {
    let { bindings, code, isReactiveCall, sourceFile } = parse(source),
        result = object(sourceFile, bindings, isReactiveCall);

    return {
        bindings,
        output: applyIntents(code, sourceFile, result.replacements),
        prepend: result.prepend
    };
}

// Kind of the binding the variable `name` declares
function typeOf(bindings: Bindings, name: string): number | null {
    let found: ts.Identifier | undefined,
        visit = (node: ts.Node): void => {
            if (!found && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
                found = node.name;
            }

            node.forEachChild(visit);
        };

    visit(bindings.sourceFile);

    return found ? scope.kind(bindings, scope.origin(bindings, found)) : null;
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

    it('builds a non-literal array or object argument with the runtime reactive()', () => {
        let { output } = transformPrimitives('declare function someCall(): number[];\nlet x = reactive(someCall());');

        expect(output).toContain(`${NAMESPACE}.reactive(someCall())`);
    });

    it('classifies a non-literal primitive argument as a signal by its type', () => {
        let { output } = transformPrimitives('declare let n: number;\nlet x = reactive(n);\nlet y = x + 1;');

        expect(output).toContain(`let x = ${NAMESPACE}.signal(n)`);
        expect(output).toContain(`let y = ${NAMESPACE}.read(x) + 1`);
    });

    it('classifies a function-typed argument as a computed', () => {
        let { output } = transformPrimitives('declare function total(): number;\nlet x = reactive(total);');

        expect(output).toContain(`let x = ${NAMESPACE}.computed(total)`);
    });

    it('rejects an argument whose kind is not provable', () => {
        let { failures } = transformPrimitives('declare let value: any;\nlet x = reactive(value);');

        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain('provable');
    });

    it('rejects a signal that does not initialize a variable', () => {
        let { failures } = transformPrimitives('declare function take(value: unknown): void;\ntake(reactive(0));\nlet o = { count: reactive(1) };');

        expect(failures).toHaveLength(2);
        expect(failures[0]).toContain('must initialize a variable');
    });

    it('rejects a write to a computed', () => {
        let { failures } = transformPrimitives('let d = reactive(() => 1);\nd = 2;');

        expect(failures).toEqual(['a reactive computed is read-only']);
    });

    it('rejects a destructuring assignment into a reactive binding', () => {
        let { failures } = transformPrimitives('let x = reactive(0);\n[x] = [1];');

        expect(failures[0]).toContain('destructuring');
    });

    it('reads a binding assigned with reactive() after its declaration', () => {
        let { output } = transformPrimitives('let x: number;\nx = reactive(0);\nlet y = x + 1;');

        expect(output).toContain(`let y = ${NAMESPACE}.read(x) + 1`);
    });

    it('reads through typeof', () => {
        let { output } = transformPrimitives("let x = reactive(0);\nlet t = typeof x;");

        expect(output).toContain(`let t = typeof ${NAMESPACE}.read(x)`);
    });

    it('tracks bindings for signal type', () => {
        let { bindings } = transformPrimitives('let x = reactive(0);');

        expect(typeOf(bindings, 'x')).toBe(TYPES.Signal);
    });

    it('tracks bindings for computed type', () => {
        let { bindings } = transformPrimitives('let x = reactive(0); let d = reactive(() => x * 2);');

        expect(typeOf(bindings, 'd')).toBe(TYPES.Computed);
    });

    it('leaves a same-named plain variable in a sibling function untouched', () => {
        let { output } = transformPrimitives('function a() { let x = reactive(0); return x; }\nfunction b() { let x = 1; return x; }');

        expect(output).toContain(`function a() { let x = ${NAMESPACE}.signal(0); return ${NAMESPACE}.read(x); }`);
        expect(output).toContain('function b() { let x = 1; return x; }');
    });

    it('resolves a shadowing inner binding to the innermost declaration', () => {
        let { output } = transformPrimitives('let x = reactive(0); function f() { let x = reactive(() => 1); x = 2; }');

        expect(output).toContain(`let x = ${NAMESPACE}.signal(0)`);
        expect(output).toContain(`let x = ${NAMESPACE}.computed(() => 1)`);
        expect(output).not.toContain(`${NAMESPACE}.write(x, 2)`);
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

    it('passes every array property to the constructor, static elements included', () => {
        let { output } = transformObject('let obj = reactive({ n: 1, items: [1, 2] });');

        expect(output).toMatch(/new ReactiveObject_\w+\(\[1, 2\]\)/);
    });

    it('makes a non-literal array property a reactive array', () => {
        let { prepend } = transformObject('declare let list: number[];\nlet obj = reactive({ items: list });');

        expect(prepend[0]).toContain(`${NAMESPACE}.REACTIVE_ARRAY`);
    });
});


describe('array transform', () => {
    it('transforms reactive([1,2,3]) to ReactiveArray', () => {
        let { output } = transformArray('let arr = reactive([1, 2, 3]);');

        expect(output).toContain(`new ${NAMESPACE}.ReactiveArray`);
        expect(output).toContain('([1, 2, 3])');
    });

    it('transforms reactive([] as Type[]) to typed ReactiveArray', () => {
        let { output } = transformArray('let arr = reactive([] as number[]);');

        expect(output).toContain(`new ${NAMESPACE}.ReactiveArray<number>()`);
    });

    it('transforms arr.length read to arr.$length', () => {
        let { output } = transformArray('let arr = reactive([1]); let x = arr.length;');

        expect(output).toContain('arr.$length');
    });

    it('transforms arr.length = n to arr.$length = n', () => {
        let { output } = transformArray('let arr = reactive([1]); arr.length = 5;');

        expect(output).toContain('arr.$length = 5');
    });

    it('transforms arr.length += n to arr.$length = arr.length + n', () => {
        let { output } = transformArray('let arr = reactive([1]); arr.length += 3;');

        expect(output).toContain('arr.$length = arr.length + 3');
    });

    it('transforms every compound operator on arr.length with its own token', () => {
        for (let op of ['<<', '>>', '>>>', '??', '||', '&&', '-', '*', '/', '%', '**', '&', '|', '^']) {
            let { output } = transformArray(`let arr = reactive([1]); arr.length ${op}= 2;`);

            expect(output).toContain(`arr.$length = arr.length ${op} 2`);
        }
    });

    it('transforms arr[i] = value to arr.$set(i, value)', () => {
        let { output } = transformArray('let arr = reactive([1]); arr[0] = 42;');

        expect(output).toContain('arr.$set(');
        expect(output).toContain('42');
    });

    it('tracks reactive array binding from reactive call', () => {
        let { bindings } = transformArray('let arr = reactive([1, 2, 3]);');

        expect(typeOf(bindings, 'arr')).toBe(TYPES.Array);
    });

    it('compiles an alias of a reactive array by its type', () => {
        let { output } = transformArray('let a = reactive([1]); let b = a; let n = b.length;');

        expect(output).toContain('let n = b.$length');
    });

    it('compiles a ReactiveArray-typed parameter by its type', () => {
        let { output } = transformArray('function fn(arr: ReactiveArray<number>) { arr[0] = 1; return arr.length; }');

        expect(output).toContain('arr.$set(0, 1)');
        expect(output).toContain('return arr.$length');
    });

    it('compiles an array property of a reactive object by its type', () => {
        let { output } = transformArray('let obj = reactive({ items: [1] }); let n = obj.items.length;');

        expect(output).toContain('let n = obj.items.$length');
    });

    it('routes compound and increment element writes through $set', () => {
        let { output } = transformArray('let arr = reactive([1]); arr[0] += 2; arr[0]++;');

        expect(output).toContain('((_a, _k) => _a.$set(_k, _a[_k] + (2)))(arr, 0)');
        expect(output).toContain('((_a, _k, _v) => (_a.$set(_k, _v + 1), _v))(arr, 0, arr[0])');
    });

    it('leaves a plain array untouched', () => {
        let { output } = transformArray('let arr = [1]; arr[0] = 2; let n = arr.length;');

        expect(output).toContain('arr[0] = 2; let n = arr.length;');
    });

    it('transforms empty array', () => {
        let { output } = transformArray('let arr = reactive([] as string[]);');

        expect(output).toContain(`new ${NAMESPACE}.ReactiveArray<string>()`);
    });
});


describe('binding resolution (full pipeline)', () => {
    it('leaves a local array that shadows a reactive array untouched', () => {
        let output = transformModule('let rows = reactive([] as number[]);\nfunction build(n: number) { let rows: number[] = []; rows[0] = n; return rows.length; }');

        expect(output).toContain('let rows: number[] = []; rows[0] = n; return rows.length;');
    });

    it('leaves a parameter that shadows a reactive array untouched', () => {
        let output = transformModule('let rows = reactive([1]);\nconst f = (rows: number[]) => { rows[0] = 2; };');

        expect(output).toContain('const f = (rows: number[]) => { rows[0] = 2; };');
    });

    it('leaves a local that shadows a signal untouched', () => {
        let output = transformModule('let count = reactive(0);\nfunction f() { let count = 5; count++; return count; }');

        expect(output).toContain('function f() { let count = 5; count++; return count; }');
    });

    it('leaves a parameter that shadows a signal untouched', () => {
        let output = transformModule('let count = reactive(0);\nconst f = (count: number) => count + 1;');

        expect(output).toContain('const f = (count: number) => count + 1;');
    });

    it('never rewrites property names, type members or destructured parameters', () => {
        let output = transformModule('let count = reactive(0);\nlet o = { count: 1 };\nlet p = o.count;\nfunction f({ count }: { count: number }) { return count; }');

        expect(output).toContain('let o = { count: 1 };');
        expect(output).toContain('let p = o.count;');
        expect(output).toContain('function f({ count }: { count: number }) { return count; }');
    });

    it('expands a shorthand property into a read', () => {
        let output = transformModule('let count = reactive(0);\nlet o = { count };');

        expect(output).toContain(`let o = { count: ${NAMESPACE}.read(count) };`);
    });

    it('rewrites a use that precedes the declaration in source order', () => {
        let output = transformModule('function inc() { count++; }\nlet count = reactive(0);');

        expect(output).toContain(`function inc() { ${NAMESPACE}.write(count, count.value + 1); }`);
    });

    it('exports the signal itself rather than splicing a read into the export list', () => {
        let output = transformModule('let count = reactive(0);\nexport { count };');

        expect(output).toContain('export { count };');
    });

    it('transforms a namespace-qualified reactive() call', () => {
        let output = transformModule("import * as r from '@esportsplus/reactivity';\nlet count = r.reactive(0);\nlet next = count + 1;");

        expect(output).toContain(`let count = ${NAMESPACE}.signal(0);`);
        expect(output).toContain(`let next = ${NAMESPACE}.read(count) + 1;`);
    });

    it('transforms calls through an aliased import', () => {
        let output = transformSource("import { reactive as r } from '@esportsplus/reactivity';\nlet count = r(0);\nlet next = count + 1;");

        expect(output).toContain(`let count = ${NAMESPACE}.signal(0);`);
        expect(output).toContain(`let next = ${NAMESPACE}.read(count) + 1;`);
    });

    it('transforms a reactive array created through an aliased import', () => {
        let output = transformSource("import { reactive as r } from '@esportsplus/reactivity';\nlet list = r([1, 2]);\nlet size = list.length;");

        expect(output).not.toContain('r([1, 2])');
        expect(output).toContain('let size = list.$length');
    });

    it('leaves a parameter that shadows an alias untouched', () => {
        let code = "import { reactive as r } from '@esportsplus/reactivity';\nfunction f(r: (n: number) => number) { return r(1); }";

        expect(transformSource(code)).toBe(code);
    });

    it('leaves another export imported under the name reactive untouched', () => {
        let code = "import { root as reactive } from '@esportsplus/reactivity';\nlet value = reactive(() => 1);";

        expect(transformSource(code)).toBe(code);
    });
});


describe('index transform', () => {
    // A module can reach reactive() or read a binding under any name, so no text prefilter may skip it
    it('has no text patterns', () => {
        expect('patterns' in pipeline).toBe(false);
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

import { describe, expect, it } from 'vitest';
import { ts } from '@esportsplus/typescript';
import { coordinator, languageService } from '@esportsplus/typescript/compiler';
import type { Plugin, ReplacementIntent } from '@esportsplus/typescript/compiler';
import { NAMESPACE } from '~/compiler/constants';

import pipeline from '~/compiler/index';


// Stands in for template: rewrites every `tag` tagged template, which reactivity's own rewrites may contain
const FOREIGN: Plugin = {
    name: 'foreign',
    transform: ({ sourceFile }) => {
        let replacements: ReplacementIntent[] = [],
            visit = (node: ts.Node): void => {
                if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === 'tag') {
                    replacements.push({ generate: () => 'TAGGED', node });
                }

                node.forEachChild(visit);
            };

        visit(sourceFile);

        return { replacements };
    }
};

const PRELUDE = "import { reactive } from '@esportsplus/reactivity';\n";


function compile(code: string, plugins: Plugin[] = [pipeline]): string {
    code = PRELUDE + code;

    let { checker, program, sourceFile } = languageService.scratch(process.cwd() + '/composed.ts', code);

    return coordinator.transform(plugins, code, sourceFile, { checker, program }, process.cwd(), new Map()).code;
}


describe('nested rewrites', () => {
    let output = compile([
        'let x = reactive(0);',
        'let y = reactive(1);',
        'x = y;',
        'x += y;',
        'let arr = reactive([y]);',
        'arr[0] = y;',
        'arr[1] += y;',
        'arr.length = y;',
        'arr = [y];',
        'let o = reactive({ a: y, items: [y] });',
        'let s = reactive({ ...{ b: 1 }, c: y });',
        'let e = { y: { y } };'
    ].join('\n'));

    it('reads a signal on the right of a write to another', () => {
        expect(output).toContain(`${NAMESPACE}.write(x, ${NAMESPACE}.read(y));`);
        expect(output).toContain(`${NAMESPACE}.write(x, x.value + ${NAMESPACE}.read(y));`);
    });

    it('reads a signal inside array lowerings', () => {
        expect(output).toContain(`let arr =  new ${NAMESPACE}.ReactiveArray([${NAMESPACE}.read(y)]);`);
        expect(output).toContain(`arr.$set(0, ${NAMESPACE}.read(y));`);
        expect(output).toContain(`((_a, _k) => _a.$set(_k, _a[_k] + (${NAMESPACE}.read(y))))(arr, 1);`);
        expect(output).toContain(`arr.$length = ${NAMESPACE}.read(y);`);
        expect(output).toContain(`arr.splice(0, arr.length, ...[${NAMESPACE}.read(y)]);`);
    });

    it('reads a signal inside object lowerings', () => {
        expect(output).toMatch(new RegExp(`let o = +new ReactiveObject_\\w+\\(${NAMESPACE}\\.read\\(y\\), \\[${NAMESPACE}\\.read\\(y\\)\\]\\);`));
        expect(output).toContain(`let s = ${NAMESPACE}.reactive({ ...{ b: 1 }, c: ${NAMESPACE}.read(y) });`);
        expect(output).toContain(`let e = { y: { y: ${NAMESPACE}.read(y) } };`);
    });
});


describe('composition with another plugin', () => {
    let code = [
        'declare function tag(strings: TemplateStringsArray): number;',
        'let count = reactive(tag`a`);',
        'count = tag`b`;',
        'count += tag`c`;',
        'let o = reactive({ n: tag`d` });',
        'let s = reactive({ ...{}, n: tag`e` });',
        'let arr = reactive([tag`f`]);',
        'arr[0] = tag`g`;',
        'arr = [tag`h`];'
    ].join('\n');

    for (let [order, plugins] of [['before', [FOREIGN, pipeline]], ['after', [pipeline, FOREIGN]]] as const) {
        it(`keeps the other plugin's replacements inside every lowering when it runs ${order}`, () => {
            let output = compile(code, [...plugins]);

            expect(output).not.toContain('tag`');
            expect(output).toContain(`let count = ${NAMESPACE}.signal(TAGGED);`);
            expect(output).toContain(`${NAMESPACE}.write(count, TAGGED);`);
            expect(output).toContain(`${NAMESPACE}.write(count, count.value + TAGGED);`);
            expect(output).toMatch(/let o = +new ReactiveObject_\w+\(TAGGED\);/);
            expect(output).toContain(`let s = ${NAMESPACE}.reactive({ ...{}, n: TAGGED });`);
            expect(output).toContain(`let arr =  new ${NAMESPACE}.ReactiveArray([TAGGED]);`);
            expect(output).toContain('arr.$set(0, TAGGED);');
            expect(output).toContain('arr.splice(0, arr.length, ...[TAGGED]);');
        });
    }
});

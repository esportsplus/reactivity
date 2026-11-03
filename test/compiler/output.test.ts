import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import vite from '~/compiler/plugins/vite';


// Whole compiled modules, pinned byte for byte: every lowering form the compiler emits, each one
// alone in its range so no output depends on how nested rewrites compose
const FILES: Record<string, string> = {
    'app.ts': [
        "export { reactive as make } from '@esportsplus/reactivity';",
        "export * from './state';",
        "export { default as total } from './state';"
    ].join('\n'),
    'consumer.ts': [
        "import { count as renamed, later, make, total } from './app';",
        "import * as app from './app';",
        'export let a = make(0);',
        'export let b = () => renamed + total + later;',
        'export let c = () => app.count + app.list.length;',
        "export let d = () => app['count'];",
        'export let e = () => { app.list[0] = 1; };'
    ].join('\n'),
    'forms.ts': [
        "import { reactive } from '@esportsplus/reactivity';",
        'declare function total(): number;',
        'declare let list: number[];',
        'declare let n: number;',
        'let count = reactive(0);',
        'let doubled = reactive(() => count * 2);',
        'let typed = reactive(n);',
        'let fn = reactive(total);',
        'let runtime = reactive(list);',
        'let obj = reactive({ a: 1, b: \'x\', items: [1, 2], sum: () => 3, neg: -1, source: list, flag: true });',
        'let shorthand = reactive({ list });',
        'let hinted = reactive<{ a: number; items: number[] }>({ a: 1, items: [] });',
        'let spread = reactive({ ...{ a: 1 }, b: 2 });',
        'let method = reactive({ m() { return 1; } });',
        'let arr = reactive([1, 2, 3]);',
        'let empty = reactive([] as string[]);',
        'let declared: number[] = reactive([4]);',
        'count = 5;',
        'count += 2;',
        'count ||= 3;',
        'count++;',
        '--count;',
        'let p = count++;',
        'let q = ++count;',
        'let o = { count };',
        'let t = typeof count;',
        'arr[0] = 4;',
        'arr[1] += 2;',
        'arr[2]++;',
        'let r = ++arr[0];',
        'let size = arr.length;',
        'arr.length = 1;',
        'arr.length += 1;',
        'arr.length++;',
        'arr = [5, 6];',
        'arr = [];',
        'export { count, doubled, typed, fn, runtime, obj, shorthand, hinted, spread, method, empty, declared, p, q, o, t, r, size };',
        'export default reactive(0);'
    ].join('\n'),
    'state.ts': [
        "import { reactive } from '@esportsplus/reactivity';",
        'export let count = reactive(0);',
        'export let list = reactive([1, 2]);',
        'export let later: number;',
        'later = reactive(1);',
        'export default reactive(() => 2);'
    ].join('\n')
};


let fixtures: string[] = [];


function compile(name: string): string | null {
    let directory = mkdtempSync(join(process.cwd(), '.fixture-output-')).replace(/\\/g, '/');

    fixtures.push(directory);

    for (let [file, code] of Object.entries(FILES)) {
        writeFileSync(join(directory, file), code);
    }

    writeFileSync(join(directory, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { module: 'esnext', moduleResolution: 'bundler', strict: true, target: 'esnext', types: [] },
        files: Object.keys(FILES).map(file => './' + file)
    }));

    let plugin = vite({ root: directory });

    plugin.configResolved({ command: 'build', root: directory });

    return plugin.transform(FILES[name], directory + '/' + name)?.code ?? null;
}


afterEach(() => {
    for (let i = 0, n = fixtures.length; i < n; i++) {
        rmSync(fixtures[i], { force: true, recursive: true });
    }

    fixtures = [];
});


describe('compiled output', () => {
    for (let name of Object.keys(FILES)) {
        it(name, () => {
            expect(compile(name)).toMatchSnapshot();
        });
    }
});

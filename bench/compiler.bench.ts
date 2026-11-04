import { afterAll, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { coordinator, languageService } from '@esportsplus/typescript/compiler';
import type { ts } from '@esportsplus/typescript';

import pipeline from '~/compiler/index';


// A small app: a state module, a central barrel, consumers reading through it, and modules the
// compiler must leave alone (no import at all, or imports that never reach reactive)
const FILES: Record<string, string> = {
    'app.ts': [
        "export { reactive as make } from '@esportsplus/reactivity';",
        "export * from './state';"
    ].join('\n'),
    'consumer.ts': [
        "import { count, list, make, store } from './app';",
        "import * as app from './app';",
        'export let local = make(0);',
        'export let a = () => count + app.count + local;',
        'export let b = () => list.length + store.items.length;',
        'export let c = () => { list[0] = count; local += count; };'
    ].join('\n'),
    'helpers.ts': [
        "import { join } from 'node:path';",
        'export let path = (a: string, b: string) => join(a, b);',
        'export let sum = (values: number[]) => values.reduce((total, value) => total + value, 0);'
    ].join('\n'),
    'plain.ts': [
        'export let clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));',
        'export let range = (n: number) => Array.from({ length: n }, (_, i) => i);'
    ].join('\n'),
    'runtime.ts': [
        "import { reactive } from '@esportsplus/reactivity';",
        'let count = reactive(0);',
        'let doubled = reactive(() => count * 2);',
        'let list = reactive([1, 2, 3]);',
        'let store = reactive({ items: [1], n: 1 });',
        'export let run = (): number => {',
        '    let total = 0;',
        '    for (let i = 0; i < 100; i++) {',
        '        count++;',
        '        list[0] = i;',
        '        store.n = i;',
        '        total += doubled + list.length + store.n;',
        '    }',
        '    return total;',
        '};'
    ].join('\n'),
    'state.ts': [
        "import { reactive } from '@esportsplus/reactivity';",
        'export let count = reactive(0);',
        'export let list = reactive([1, 2]);',
        'export let store = reactive({ items: [1], n: 1 });'
    ].join('\n')
};

const NAMES = Object.keys(FILES);


let directory = mkdtempSync(join(process.cwd(), '.fixture-bench-')).replace(/\\/g, '/'),
    config = directory + '/tsconfig.json';

for (let i = 0, n = NAMES.length; i < n; i++) {
    writeFileSync(join(directory, NAMES[i]), FILES[NAMES[i]]);
}

writeFileSync(config, JSON.stringify({
    compilerOptions: { module: 'esnext', moduleResolution: 'bundler', strict: true, target: 'esnext', types: [] },
    files: NAMES.map(name => './' + name)
}));


// One build pass: every module is transformed against one program and one checker, as tsc and vite
// hand them in, so the coordinator's memo is shared across the pass. Each pass wraps the checker
// anew, so its memo starts empty and every query the pass needs reaches tsgo once.
function build(names: string[]): string[] {
    let checker: ts.Checker | null = null,
        code: string[] = [];

    for (let i = 0, n = names.length; i < n; i++) {
        let id = directory + '/' + names[i],
            project = languageService.update(config, id, FILES[names[i]]);

        checker ??= new Proxy(project.checker, {});
        code.push(coordinator.transform([pipeline], FILES[names[i]], project.program.getSourceFile(id)!, { checker, program: project.program }, directory, new Map()).code);
    }

    return code;
}


afterAll(() => {
    languageService.dispose();
    rmSync(directory, { force: true, recursive: true });
});


test('compiler transform', async ({ bench }) => {
    await bench.compare(
        bench('every module of the app', () => {
            build(NAMES);
        }),
        bench('modules without reactive (no import, unrelated import)', () => {
            build(['helpers.ts', 'plain.ts']);
        })
    );
});

test('compiled output', async ({ bench }) => {
    let file = directory + '/runtime.compiled.ts';

    writeFileSync(file, build(['runtime.ts'])[0]);

    let { run } = await import(pathToFileURL(file).href) as { run: () => number };

    await bench('signal, computed, array and object reads and writes', () => {
        run();
    }).run();
});

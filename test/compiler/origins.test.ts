import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NAMESPACE } from '~/compiler/constants';

import vite from '~/compiler/plugins/vite';


// `reactive`, and the bindings it creates, reached under any name: resolution may prune what it
// sends to the checker, never by name
const FILES: Record<string, string> = {
    'app.ts': [
        "export { reactive as signalOf } from '@esportsplus/reactivity';",
        "export { default as fallback } from './state';",
        "export * from './mid';"
    ].join('\n'),
    'consumer.ts': [
        "import { deepCount, fallback, held, later, signalOf } from './app';",
        "import * as app from './app';",
        'const { signalOf: unpacked } = app;',
        'export let a = signalOf(0);',
        'export let b = app.signalOf(0);',
        "export let c = app['signalOf'](0);",
        'export let d = unpacked(0);',
        'export let e = held(0);',
        'export let f = () => fallback + deepCount + later;',
        'export let g = () => app.later + app.deepCount;'
    ].join('\n'),
    'deep.ts': [
        "export * from '@esportsplus/reactivity';",
        "export { count as deepCount } from './state';"
    ].join('\n'),
    'held.ts': [
        "import { reactive } from '@esportsplus/reactivity';",
        'export const held = reactive;'
    ].join('\n'),
    'local.ts': [
        "import { reactive as x } from '@esportsplus/reactivity';",
        'export function before() { return late; }',
        'let late: number;',
        'late = x(0);',
        'export let after = late + 1;',
        'export let count = x(1);',
        'export let next = count + 1;',
        'export function shadow(x: (n: number) => number) { return x(1); }'
    ].join('\n'),
    'mid.ts': [
        "export * from './deep';",
        "export { held } from './held';",
        "export { later } from './state';"
    ].join('\n'),
    'star.ts': [
        "import { reactive } from './mid';",
        'export let s = reactive(0);',
        'export let t = s + 1;'
    ].join('\n'),
    'state.ts': [
        "import { reactive } from '@esportsplus/reactivity';",
        'export let count = reactive(0);',
        'export let later: number;',
        'later = reactive(1);',
        'export default reactive(2);'
    ].join('\n')
};


let fixtures: string[] = [];


async function compile(name: string, files: Record<string, string> = FILES): Promise<string> {
    let directory = mkdtempSync(join(process.cwd(), '.fixture-origins-')).replace(/\\/g, '/');

    fixtures.push(directory);

    for (let [file, code] of Object.entries(files)) {
        writeFileSync(join(directory, file), code);
    }

    writeFileSync(join(directory, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { module: 'esnext', moduleResolution: 'bundler', strict: true, target: 'esnext', types: [] },
        files: Object.keys(files).map(file => './' + file)
    }));

    let plugin = vite({ root: directory });

    plugin.configResolved({ command: 'build', root: directory });

    return (await plugin.transform.handler(files[name], directory + '/' + name))?.code ?? files[name];
}


afterEach(() => {
    for (let i = 0, n = fixtures.length; i < n; i++) {
        rmSync(fixtures[i], { force: true, recursive: true });
    }

    fixtures = [];
});


describe('origins reached under any name', () => {
    it('compiles reactive() imported under a local alias, and leaves a parameter shadowing it', async () => {
        let output = await compile('local.ts');

        expect(output).toContain(`export let count = ${NAMESPACE}.signal(1);`);
        expect(output).toContain(`export let next = ${NAMESPACE}.read(count) + 1;`);
        expect(output).toContain('export function shadow(x: (n: number) => number) { return x(1); }');
    });

    it('reads a let assigned with reactive() later, before and after the assignment', async () => {
        let output = await compile('local.ts');

        expect(output).toContain(`export function before() { return ${NAMESPACE}.read(late); }`);
        expect(output).toContain(`late = ${NAMESPACE}.signal(0);`);
        expect(output).toContain(`export let after = ${NAMESPACE}.read(late) + 1;`);
    });

    it('reads a let assigned with reactive() in another module', async () => {
        let output = await compile('consumer.ts');

        expect(output).toContain(`${NAMESPACE}.read(later)`);
        expect(output).toContain(`${NAMESPACE}.read(app.later)`);
    });

    it('compiles reactive() re-exported renamed through a central module, by name and through its namespace', async () => {
        let output = await compile('consumer.ts');

        for (let name of ['a', 'b', 'c', 'd']) {
            expect(output).toContain(`export let ${name} = ${NAMESPACE}.signal(0);`);
        }
    });

    it('compiles reactive() held by an exported const', async () => {
        expect(await compile('consumer.ts')).toContain(`export let e = ${NAMESPACE}.signal(0);`);
    });

    it('reads a default export re-exported renamed, and bindings through export * two deep', async () => {
        let output = await compile('consumer.ts');

        expect(output).toContain(`export let f = () => ${NAMESPACE}.read(fallback) + ${NAMESPACE}.read(deepCount) + ${NAMESPACE}.read(later);`);
        expect(output).toContain(`export let g = () => ${NAMESPACE}.read(app.later) + ${NAMESPACE}.read(app.deepCount);`);
    });

    it('compiles reactive() reached through export * two deep', async () => {
        let output = await compile('star.ts');

        expect(output).toContain(`export let s = ${NAMESPACE}.signal(0);`);
        expect(output).toContain(`export let t = ${NAMESPACE}.read(s) + 1;`);
    });

    it('leaves a module that imports nothing untouched', async () => {
        let code = 'let reactive = (n: number) => n;\nexport let x = reactive(1);';

        expect(await compile('plain.ts', { ...FILES, 'plain.ts': code })).toBe(code);
    });
});

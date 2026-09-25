import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NAMESPACE } from '~/compiler/constants';
import vite from '~/compiler/plugins/vite';


// Every route by which a module reaches `reactive`, or a binding it created, must compile
const FILES: Record<string, string> = {
    'state.ts': [
        "import { reactive } from '@esportsplus/reactivity';",
        'export let count = reactive(0);',
        'export let list = reactive([1, 2]);',
        'export let store = reactive({ n: 1, items: [1] });',
        'export default reactive(0);'
    ].join('\n'),
    'barrel.ts': [
        "export { reactive as make } from '@esportsplus/reactivity';",
        "export * as R from '@esportsplus/reactivity';",
        "export * from './state';"
    ].join('\n'),
    'reads.ts': [
        "import { count, list, store } from './state';",
        "import * as S from './state';",
        "import fallback from './state';",
        "import { count as renamed } from './barrel';",
        'export let a = () => count + 1;',
        'export let b = () => S.count + 1;',
        'export let c = () => fallback + 1;',
        'export let d = () => renamed + 1;',
        'export let e = () => list.length;',
        'export let f = () => { list[0] = 5; };',
        'export let g = () => store.items.length;',
        "export let h = () => S['count'] + 1;"
    ].join('\n'),
    'entries.ts': [
        "import { make, R } from './barrel';",
        "import * as B from './barrel';",
        'export let a = make(0);',
        'export let b = R.reactive(0);',
        'export let c = B.R.reactive(0);',
        "export let d = R['reactive'](0);",
        'const alias = make;',
        'export let e = alias(0);',
        'const { reactive: destructured } = R;',
        'export let f = destructured(0);',
        'export let g = () => a + b + c + d + e + f;'
    ].join('\n')
};


let fixtures: string[] = [];


function project(files: Record<string, string>) {
    let directory = mkdtempSync(join(process.cwd(), '.fixture-coverage-')).replace(/\\/g, '/');

    fixtures.push(directory);

    for (let [name, code] of Object.entries(files)) {
        writeFileSync(join(directory, name), code);
    }

    writeFileSync(join(directory, 'tsconfig.json'), JSON.stringify({
        compilerOptions: { module: 'esnext', moduleResolution: 'bundler', strict: true, target: 'esnext', types: [] },
        files: Object.keys(files).map(name => './' + name)
    }));

    let plugin = vite({ root: directory });

    plugin.configResolved({ command: 'build', root: directory });

    return {
        directory,
        plugin,
        transform: (name: string) => plugin.transform(files[name], directory + '/' + name)
    };
}


afterEach(() => {
    for (let fixture of fixtures) {
        rmSync(fixture, { force: true, recursive: true });
    }

    fixtures = [];
});


describe('compiler coverage', () => {
    it('compiles reads of bindings imported by name, namespace, default, barrel and string key', () => {
        let output = project(FILES).transform('reads.ts')!.code;

        expect(output).toContain(`export let a = () => ${NAMESPACE}.read(count) + 1;`);
        expect(output).toContain(`export let b = () => ${NAMESPACE}.read(S.count) + 1;`);
        expect(output).toContain(`export let c = () => ${NAMESPACE}.read(fallback) + 1;`);
        expect(output).toContain(`export let d = () => ${NAMESPACE}.read(renamed) + 1;`);
        expect(output).toContain('export let e = () => list.$length;');
        expect(output).toContain('list.$set(0, 5)');
        expect(output).toContain('export let g = () => store.items.$length;');
        expect(output).toContain(`export let h = () => ${NAMESPACE}.read(S['count']) + 1;`);
    });

    it('compiles reactive() reached through renames, namespaces, string keys and const aliases', () => {
        let output = project(FILES).transform('entries.ts')!.code;

        for (let name of ['a', 'b', 'c', 'd', 'e', 'f']) {
            expect(output).toMatch(new RegExp(`export let ${name} = ${NAMESPACE}\\.signal\\(0\\);`));
        }

        expect(output).toContain(`${NAMESPACE}.read(a) + ${NAMESPACE}.read(b)`);
    });

    it('passes every array property of a reactive object to its constructor', () => {
        let output = project(FILES).transform('state.ts')!.code;

        expect(output).toMatch(/export let store = +new ReactiveObject_\w+\(\[1\]\);/);
    });

    it('fails the build on every use of reactive that cannot be compiled, with its location', () => {
        let files = {
                'escape.ts': [
                    "import { reactive } from '@esportsplus/reactivity';",
                    'declare function take(value: unknown): void;',
                    'take(reactive);',
                    'take(reactive(0));'
                ].join('\n')
            },
            { transform } = project(files);

        expect(() => transform('escape.ts')).toThrow(/escape\.ts:3:6[\s\S]*escape\.ts:4:6/);
    });

    it('fails the build when a signal is destructured out of a module namespace', () => {
        let files = {
                'state.ts': "import { reactive } from '@esportsplus/reactivity';\nexport let count = reactive(0);",
                'copy.ts': "import * as S from './state';\nconst { count } = S;\nexport let n = count;"
            },
            { transform } = project(files);

        expect(() => transform('copy.ts')).toThrow(/copy\.ts:2:9.*destructured/);
    });

    it('reports the modules a compile relied on so hosts can recompile it when they change', () => {
        let { directory, plugin, transform } = project(FILES),
            dependent = { id: directory + '/reads.ts' };

        transform('reads.ts');

        let result = plugin.handleHotUpdate({
            file: directory + '/state.ts',
            modules: [],
            server: {
                moduleGraph: {
                    getModulesByFile: (file: string) => file.toLowerCase() === (directory + '/reads.ts').toLowerCase() ? new Set([dependent]) : undefined,
                    invalidateModule: () => {}
                }
            },
            timestamp: 1
        });

        expect(result).toEqual([dependent]);
    });
});

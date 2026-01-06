import { ts } from '@esportsplus/typescript';
import { code as c, imports, uid } from '@esportsplus/typescript/compiler';
import { COMPILER_ENTRYPOINT, COMPILER_ENTRYPOINT_REGEX, PACKAGE } from '~/constants';
import type { AliasKey, Aliases, Bindings, TransformResult } from '~/types';
import array from './array';
import object from './object';
import primitives from './primitives';


let aliases: Aliases = {
        computed: uid('computed'),
        dispose: uid('dispose'),
        ReactiveArray: uid('ReactiveArray'),
        REACTIVE_OBJECT: uid('REACTIVE_OBJECT'),
        read: uid('read'),
        signal: uid('signal'),
        write: uid('write')
    },
    transforms = [object, array, primitives];


function hasReactiveImport(sourceFile: ts.SourceFile): boolean {
    let found = imports.find(sourceFile, PACKAGE);

    for (let i = 0, n = found.length; i < n; i++) {
        if (found[i].specifiers.has(COMPILER_ENTRYPOINT)) {
            return true;
        }
    }

    return false;
}

function hasReactiveUsage(code: string): boolean {
    if (!c.contains(code, { regex: COMPILER_ENTRYPOINT_REGEX })) {
        return false;
    }

    let sourceFile = ts.createSourceFile('detect.ts', code, ts.ScriptTarget.Latest, false),
        used = false;

    function visit(node: ts.Node): void {
        if (used) {
            return;
        }

        if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === COMPILER_ENTRYPOINT
        ) {
            used = true;
            return;
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    return used;
}


const transform = (sourceFile: ts.SourceFile, program: ts.Program): TransformResult => {
    let bindings: Bindings = new Map(),
        changed = false,
        checker = program.getTypeChecker(),
        code = sourceFile.getFullText(),
        current = sourceFile,
        result: string,
        used = new Set<AliasKey>();

    if (!hasReactiveImport(sourceFile) || !hasReactiveUsage(code)) {
        return { changed: false, code, sourceFile };
    }

    for (let i = 0, n = transforms.length; i < n; i++) {
        result = transforms[i](current, bindings, aliases, used, checker);

        if (result !== code) {
            current = ts.createSourceFile(sourceFile.fileName, result, sourceFile.languageVersion, true);
            code = result;
            changed = true;
        }
    }

    if (changed) {
        let add: string[] = [];

        for (let key of used) {
            add.push(`${key} as ${aliases[key]}`);
        }

        code = imports.modify(code, current, PACKAGE, { add, remove: [COMPILER_ENTRYPOINT] });
        sourceFile = ts.createSourceFile(sourceFile.fileName, code, sourceFile.languageVersion, true);
    }

    return { changed, code, sourceFile };
};


export { transform };

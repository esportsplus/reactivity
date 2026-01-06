import { ts } from '@esportsplus/typescript';
import { imports, uid } from '@esportsplus/typescript/compiler';
import { COMPILER_ENTRYPOINT, PACKAGE } from '~/constants';
import type { AliasKey, Aliases, Bindings, TransformResult } from '~/types';
import array from './array';
import object from './object';


let aliases: Aliases = {
        computed: uid('computed'),
        dispose: uid('dispose'),
        ReactiveArray: uid('ReactiveArray'),
        REACTIVE_OBJECT: uid('REACTIVE_OBJECT'),
        read: uid('read'),
        signal: uid('signal'),
        write: uid('write')
    },
    transforms = [object, array];


function hasReactiveImport(sourceFile: ts.SourceFile): boolean {
    let found = imports.find(sourceFile, PACKAGE);

    for (let i = 0, n = found.length; i < n; i++) {
        if (found[i].specifiers.has(COMPILER_ENTRYPOINT)) {
            return true;
        }
    }

    return false;
}

function isReactiveCall(node: ts.CallExpression, checker?: ts.TypeChecker): boolean {
    if (!ts.isIdentifier(node.expression)) {
        return false;
    }

    if (node.expression.text !== COMPILER_ENTRYPOINT) {
        return false;
    }

    return imports.isFromPackage(node.expression, PACKAGE, checker);
}

const transform = (sourceFile: ts.SourceFile, program: ts.Program): TransformResult => {
    let bindings: Bindings = new Map(),
        changed = false,
        checker = program.getTypeChecker(),
        code = sourceFile.getFullText(),
        current = sourceFile,
        result: string,
        used = new Set<AliasKey>();

    if (!hasReactiveImport(sourceFile)) {
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


export { isReactiveCall, transform };

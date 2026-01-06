import { ts } from '@esportsplus/typescript';
import { imports, uid } from '@esportsplus/typescript/compiler';
import { COMPILER_ENTRYPOINT, PACKAGE } from '~/constants';
import type { AliasKey, Aliases, Bindings, TransformResult } from '~/types';
import array from './array';
import object from './object';


let aliases: Aliases = {
        computed: uid('computed'),
        dispose: uid('dispose'),
        effect: uid('effect'),
        isPromise: uid('isPromise'),
        Reactive: uid('Reactive'),
        ReactiveArray: uid('ReactiveArray'),
        REACTIVE_OBJECT: uid('REACTIVE_OBJECT'),
        ReactiveObject: uid('ReactiveObject'),
        read: uid('read'),
        root: uid('root'),
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

function hasRemainingReactiveCalls(sourceFile: ts.SourceFile): boolean {
    let found = false;

    function visit(node: ts.Node): void {
        if (found) {
            return;
        }

        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === COMPILER_ENTRYPOINT) {
            found = true;
            return;
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    return found;
}

function isReactiveCall(node: ts.CallExpression, _checker?: ts.TypeChecker): boolean {
    if (!ts.isIdentifier(node.expression)) {
        return false;
    }

    return node.expression.text === COMPILER_ENTRYPOINT;
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
        let add: string[] = [],
            remove: string[] = [];

        for (let key of used) {
            add.push(`${key} as ${aliases[key]}`);
        }

        if (!hasRemainingReactiveCalls(current)) {
            remove.push(COMPILER_ENTRYPOINT);
        }

        code = imports.modify(code, current, PACKAGE, { add, remove });
        sourceFile = ts.createSourceFile(sourceFile.fileName, code, sourceFile.languageVersion, true);
    }

    return { changed, code, sourceFile };
};


export { isReactiveCall, transform };

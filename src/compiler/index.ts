import { ts } from '@esportsplus/typescript';
import { ast, imports } from '@esportsplus/typescript/compiler';
import { COMPILER_ENTRYPOINT, COMPILER_NAMESPACE, PACKAGE } from '~/constants';
import type { Bindings, TransformResult } from '~/types';
import array from './array';
import object from './object';


let transforms = [object, array];


function isReactiveCallNode(node: ts.Node): boolean {
    return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === COMPILER_ENTRYPOINT;
}


const isReactiveCall = (node: ts.CallExpression, _checker?: ts.TypeChecker): boolean => {
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
        result: string;

    if (!imports.find(sourceFile, PACKAGE).some(i => i.specifiers.has(COMPILER_ENTRYPOINT))) {
        return { changed: false, code, sourceFile };
    }

    for (let i = 0, n = transforms.length; i < n; i++) {
        result = transforms[i](current, bindings, checker);

        if (result !== code) {
            code = result;
            changed = true;
            current = ts.createSourceFile(sourceFile.fileName, result, sourceFile.languageVersion, true);
        }
    }

    if (changed) {
        let add: string[] = [`* as ${COMPILER_NAMESPACE}`],
            remove: string[] = [];

        if (!ast.hasMatch(current, isReactiveCallNode)) {
            remove.push(COMPILER_ENTRYPOINT);
        }

        code = imports.modify(code, current, PACKAGE, { add, remove });
        sourceFile = ts.createSourceFile(sourceFile.fileName, code, sourceFile.languageVersion, true);
    }

    return { changed, code, sourceFile };
};


export { isReactiveCall, transform };

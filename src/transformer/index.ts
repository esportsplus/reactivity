import { ts } from '@esportsplus/typescript';
import { code as c } from '@esportsplus/typescript/transformer';
import { COMPILER_ENTRYPOINT, COMPILER_ENTRYPOINT_REGEX, COMPILER_NAMESPACE } from '~/constants';
import type { Bindings, TransformResult } from '~/types';
import array from './transforms/array';
import object from './transforms/object';
import primitives from './transforms/primitives';


let transforms = [object, array, primitives];


function contains(code: string): boolean {
    if (!c.contains(code, { regex: COMPILER_ENTRYPOINT_REGEX })) {
        return false;
    }

    let ctx = {
            imported: false,
            used: false
        };

    visit(ctx, ts.createSourceFile('detect.ts', code, ts.ScriptTarget.Latest, false));

    return ctx.imported && ctx.used;
}

function visit(ctx: { imported: boolean; used: boolean; }, node: ts.Node): void {
    if (ctx.imported && ctx.used) {
        return;
    }

    if (
        ts.isImportDeclaration(node) &&
        node.importClause?.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings)
    ) {
        let elements = node.importClause.namedBindings.elements;

        for (let i = 0, n = elements.length; i < n; i++) {
            let element = elements[i];

            if ((element.propertyName?.text ?? element.name.text) === COMPILER_ENTRYPOINT) {
                ctx.imported = true;
                break;
            }
        }
    }

    if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === COMPILER_ENTRYPOINT
    ) {
        ctx.used = true;
    }

    ts.forEachChild(node, n => visit(ctx, n));
}


const transform = (sourceFile: ts.SourceFile): TransformResult => {
    let bindings: Bindings = new Map(),
        code = sourceFile.getFullText(),
        current = sourceFile,
        result: string,
        transformed = false;

    if (!contains(code)) {
        return { code, sourceFile, transformed: false };
    }

    for (let i = 0, n = transforms.length; i < n; i++) {
        result = transforms[i](current, bindings, COMPILER_NAMESPACE);

        if (result !== code) {
            current = ts.createSourceFile(sourceFile.fileName, result, sourceFile.languageVersion, true);
            code = result;
            transformed = true;
        }
    }

    if (transformed) {
        code = `import * as ${COMPILER_NAMESPACE} from '@esportsplus/reactivity';\n` + code;
        sourceFile = ts.createSourceFile(sourceFile.fileName, code, sourceFile.languageVersion, true);
    }

    return { code, sourceFile, transformed };
};


export { transform };

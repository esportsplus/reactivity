import { code as c } from '@esportsplus/typescript/transformer';
import { ts } from '@esportsplus/typescript';
import { COMPILER_ENTRYPOINT, COMPILER_ENTRYPOINT_REGEX } from '~/constants';


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


const contains = (code: string): boolean => {
    if (!c.contains(code, { regex: COMPILER_ENTRYPOINT_REGEX })) {
        return false;
    }

    let ctx = {
            imported: false,
            used: false
        };

    visit(ctx, ts.createSourceFile('detect.ts', code, ts.ScriptTarget.Latest, false));

    return ctx.imported && ctx.used;
};


export { contains };

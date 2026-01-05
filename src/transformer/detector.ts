import { mightNeedTransform as checkTransform } from '@esportsplus/typescript/transformer';
import { ts } from '@esportsplus/typescript';
import { COMPILATION_ENTRYPOINT, COMPILATION_ENTRYPOINT_REGEX } from '~/constants';


function visit(ctx: { hasImport: boolean; hasUsage: boolean; }, node: ts.Node): void {
    if (ctx.hasImport && ctx.hasUsage) {
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

            if ((element.propertyName?.text ?? element.name.text) === COMPILATION_ENTRYPOINT) {
                ctx.hasImport = true;
                break;
            }
        }
    }

    if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === COMPILATION_ENTRYPOINT
    ) {
        ctx.hasUsage = true;
    }

    ts.forEachChild(node, n => visit(ctx, n));
}


const mightNeedTransform = (code: string): boolean => {
    if (!checkTransform(code, { regex: COMPILATION_ENTRYPOINT_REGEX })) {
        return false;
    }

    let ctx = {
            hasImport: false,
            hasUsage: false
        };

    visit(ctx, ts.createSourceFile('detect.ts', code, ts.ScriptTarget.Latest, false));

    return ctx.hasImport && ctx.hasUsage;
};


export { mightNeedTransform };

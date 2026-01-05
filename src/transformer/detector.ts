import { mightNeedTransform as checkTransform } from '@esportsplus/typescript/transformer';
import { ts } from '@esportsplus/typescript';


interface DetectContext {
    hasImport: boolean;
    hasUsage: boolean;
}


const REACTIVE_REGEX = /\breactive\b/;


function visit(ctx: DetectContext, node: ts.Node): void {
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
            let el = elements[i],
                name = el.propertyName?.text ?? el.name.text;

            if (name === 'reactive') {
                ctx.hasImport = true;
                break;
            }
        }
    }

    if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'reactive'
    ) {
        ctx.hasUsage = true;
    }

    ts.forEachChild(node, n => visit(ctx, n));
}


const mightNeedTransform = (code: string): boolean => {
    if (!checkTransform(code, { regex: REACTIVE_REGEX })) {
        return false;
    }

    let ctx: DetectContext = {
            hasImport: false,
            hasUsage: false
        };

    visit(ctx, ts.createSourceFile('detect.ts', code, ts.ScriptTarget.Latest, false));

    return ctx.hasImport && ctx.hasUsage;
};


export { mightNeedTransform };

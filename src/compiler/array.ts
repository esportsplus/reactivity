import { ts } from '@esportsplus/typescript';
import { ast, code as c, type Replacement } from '@esportsplus/typescript/compiler';
import { COMPILER_NAMESPACE, COMPILER_TYPES } from '~/constants';
import type { Bindings } from '~/types';
import { isReactiveCall } from '.';


interface TransformContext {
    bindings: Bindings;
    checker?: ts.TypeChecker;
    replacements: Replacement[];
    sourceFile: ts.SourceFile;
}


function visit(ctx: TransformContext, node: ts.Node): void {
    if (ts.isCallExpression(node) && isReactiveCall(node, ctx.checker) && node.arguments.length > 0) {
        let arg = node.arguments[0],
            expression = ts.isAsExpression(arg) ? arg.expression : arg;

        if (ts.isArrayLiteralExpression(expression)) {
            if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
                ctx.bindings.set(node.parent.name.text, COMPILER_TYPES.Array);
            }

            ctx.replacements.push({
                end: node.end,
                newText: expression.elements.length > 0
                    ? ` new ${COMPILER_NAMESPACE}.ReactiveArray(...${expression.getText(ctx.sourceFile)})`
                    : ` new ${COMPILER_NAMESPACE}.ReactiveArray()`,
                start: node.pos
            });
        }
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (ts.isIdentifier(node.initializer) && ctx.bindings.get(node.initializer.text) === COMPILER_TYPES.Array) {
            ctx.bindings.set(node.name.text, COMPILER_TYPES.Array);
        }

        if (ts.isPropertyAccessExpression(node.initializer)) {
            let path = ast.getPropertyPathString(node.initializer);

            if (path && ctx.bindings.get(path) === COMPILER_TYPES.Array) {
                ctx.bindings.set(node.name.text, COMPILER_TYPES.Array);
            }
        }
    }

    if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) && node.parameters) {
        for (let i = 0, n = node.parameters.length; i < n; i++) {
            let param = node.parameters[i];

            if (
                (ts.isIdentifier(param.name) && param.type) &&
                ts.isTypeReferenceNode(param.type) &&
                ts.isIdentifier(param.type.typeName) &&
                param.type.typeName.text === 'ReactiveArray'
            ) {
                ctx.bindings.set(param.name.text, COMPILER_TYPES.Array);
            }
        }
    }

    let parent = node.parent;

    if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === 'length' &&
        (!!parent && (
            (ts.isBinaryExpression(parent) && parent.left === node) ||
            ts.isPostfixUnaryExpression(parent) ||
            ts.isPrefixUnaryExpression(parent)
        )) === false
    ) {
        let name = ast.getExpressionName(node.expression);

        if (name && ctx.bindings.get(name) === COMPILER_TYPES.Array) {
            ctx.replacements.push({
                end: node.end,
                newText: `${node.expression.getText(ctx.sourceFile)}.$length()`,
                start: node.pos
            });
        }
    }

    if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isElementAccessExpression(node.left)
    ) {
        let element = node.left,
            name = ast.getExpressionName(element.expression);

        if (name && ctx.bindings.get(name) === COMPILER_TYPES.Array) {
            let index = element.argumentExpression.getText(ctx.sourceFile),
                value = node.right.getText(ctx.sourceFile);

            ctx.replacements.push({
                end: node.end,
                newText: `${element.expression.getText(ctx.sourceFile)}.$set(${index}, ${value})`,
                start: node.pos
            });
        }
    }

    ts.forEachChild(node, n => visit(ctx, n));
}


export default (sourceFile: ts.SourceFile, bindings: Bindings, checker?: ts.TypeChecker): string => {
    let code = sourceFile.getFullText(),
        ctx: TransformContext = {
            bindings,
            checker,
            replacements: [],
            sourceFile
        };

    visit(ctx, sourceFile);

    if (ctx.replacements.length === 0) {
        return code;
    }

    return c.replace(code, ctx.replacements);
};

import type { ReplacementIntent } from '@esportsplus/typescript/compiler';
import { ts } from '@esportsplus/typescript';
import { ast } from '@esportsplus/typescript/compiler';
import { COMPILER_NAMESPACE, COMPILER_TYPES } from '~/constants';
import type { Bindings } from '~/types';


interface VisitContext {
    bindings: Bindings;
    checker?: ts.TypeChecker;
    replacements: ReplacementIntent[];
    sourceFile: ts.SourceFile;
}


function isReactiveCall(node: ts.CallExpression): boolean {
    return ts.isIdentifier(node.expression) && node.expression.text === 'reactive';
}

function visit(ctx: VisitContext, node: ts.Node): void {
    if (ts.isCallExpression(node) && isReactiveCall(node) && node.arguments.length > 0) {
        let arg = node.arguments[0],
            expression = ts.isAsExpression(arg) ? arg.expression : arg;

        if (ts.isArrayLiteralExpression(expression)) {
            if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
                ctx.bindings.set(node.parent.name.text, COMPILER_TYPES.Array);
            }

            ctx.replacements.push({
                node,
                generate: (sf) => expression.elements.length > 0
                    ? ` new ${COMPILER_NAMESPACE}.ReactiveArray(...${expression.getText(sf)})`
                    : ` new ${COMPILER_NAMESPACE}.ReactiveArray()`
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
                node,
                generate: (sf) => `${node.expression.getText(sf)}.$length()`
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
            ctx.replacements.push({
                node,
                generate: (sf) => {
                    let index = element.argumentExpression.getText(sf),
                        value = node.right.getText(sf);

                    return `${element.expression.getText(sf)}.$set(${index}, ${value})`;
                }
            });
        }
    }

    ts.forEachChild(node, n => visit(ctx, n));
}


export default (sourceFile: ts.SourceFile, bindings: Bindings, checker?: ts.TypeChecker): ReplacementIntent[] => {
    let ctx: VisitContext = {
            bindings,
            checker,
            replacements: [],
            sourceFile
        };

    visit(ctx, sourceFile);

    return ctx.replacements;
};

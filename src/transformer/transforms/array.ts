import type { Bindings } from '~/types';
import { createArrayLengthCall, createArraySetCall } from '../factory';
import { ts } from '@esportsplus/typescript';


interface TransformContext {
    bindings: Bindings;
    context: ts.TransformationContext;
    factory: ts.NodeFactory;
}


function getExpressionName(node: ts.Expression): string | null {
    if (ts.isIdentifier(node)) {
        return node.text;
    }

    if (ts.isPropertyAccessExpression(node)) {
        return getPropertyPath(node);
    }

    return null;
}

function getPropertyPath(node: ts.PropertyAccessExpression): string | null {
    let current: ts.Node = node,
        parts: string[] = [];

    while (ts.isPropertyAccessExpression(current)) {
        parts.unshift(current.name.text);
        current = current.expression;
    }

    if (ts.isIdentifier(current)) {
        parts.unshift(current.text);
        return parts.join('.');
    }

    return null;
}

function isAssignmentTarget(node: ts.Node): boolean {
    let parent = node.parent;

    if (!parent) {
        return false;
    }

    if (
        (ts.isBinaryExpression(parent) && parent.left === node) ||
        ts.isPostfixUnaryExpression(parent) ||
        ts.isPrefixUnaryExpression(parent)
    ) {
        return true;
    }

    return false;
}

function visit(ctx: TransformContext, node: ts.Node): ts.Node {
    // Track array bindings from variable declarations
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (ts.isIdentifier(node.initializer) && ctx.bindings.get(node.initializer.text) === 'array') {
            ctx.bindings.set(node.name.text, 'array');
        }

        if (ts.isPropertyAccessExpression(node.initializer)) {
            let path = getPropertyPath(node.initializer);

            if (path && ctx.bindings.get(path) === 'array') {
                ctx.bindings.set(node.name.text, 'array');
            }
        }
    }

    // Track array bindings from function parameters with ReactiveArray type
    if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) && node.parameters) {
        for (let i = 0, n = node.parameters.length; i < n; i++) {
            let param = node.parameters[i];

            if (
                (ts.isIdentifier(param.name) && param.type) &&
                ts.isTypeReferenceNode(param.type) &&
                ts.isIdentifier(param.type.typeName) &&
                param.type.typeName.text === 'ReactiveArray'
            ) {
                ctx.bindings.set(param.name.text, 'array');
            }
        }
    }

    // Transform array.length → array.$length()
    if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === 'length' &&
        !isAssignmentTarget(node)
    ) {
        let name = getExpressionName(node.expression);

        if (name && ctx.bindings.get(name) === 'array') {
            // First visit children to transform the expression if needed
            let transformedExpr = ts.visitEachChild(node.expression, n => visit(ctx, n), ctx.context) as ts.Expression;

            return createArrayLengthCall(ctx.factory, transformedExpr);
        }
    }

    // Transform array[index] = value → array.$set(index, value)
    if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isElementAccessExpression(node.left)
    ) {
        let elemAccess = node.left,
            objName = getExpressionName(elemAccess.expression);

        if (objName && ctx.bindings.get(objName) === 'array') {
            let transformedArray = ts.visitEachChild(elemAccess.expression, n => visit(ctx, n), ctx.context) as ts.Expression,
                transformedIndex = ts.visitEachChild(elemAccess.argumentExpression, n => visit(ctx, n), ctx.context) as ts.Expression,
                transformedValue = ts.visitEachChild(node.right, n => visit(ctx, n), ctx.context) as ts.Expression;

            return createArraySetCall(ctx.factory, transformedArray, transformedIndex, transformedValue);
        }
    }

    return ts.visitEachChild(node, n => visit(ctx, n), ctx.context);
}


const createArrayTransformer = (
    bindings: Bindings
): (context: ts.TransformationContext) => (sourceFile: ts.SourceFile) => ts.SourceFile => {
    return (context: ts.TransformationContext) => {
        return (sourceFile: ts.SourceFile): ts.SourceFile => {
            let ctx: TransformContext = {
                bindings,
                context,
                factory: context.factory
            };

            return ts.visitNode(sourceFile, n => visit(ctx, n)) as ts.SourceFile;
        };
    };
};


export { createArrayTransformer };

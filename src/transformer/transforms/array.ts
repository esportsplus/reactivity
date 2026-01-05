import type { Bindings } from '~/types';
import { applyReplacements, Replacement } from './utilities';
import { ts } from '@esportsplus/typescript';


interface TransformContext {
    bindings: Bindings;
    replacements: Replacement[];
    sourceFile: ts.SourceFile;
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

function visit(ctx: TransformContext, node: ts.Node): void {
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

    if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === 'length' &&
        !isAssignmentTarget(node)
    ) {
        let name = getExpressionName(node.expression);

        if (name && ctx.bindings.get(name) === 'array') {
            let objText = node.expression.getText(ctx.sourceFile);

            ctx.replacements.push({
                end: node.end,
                newText: `${objText}.$length()`,
                start: node.pos
            });
        }
    }

    if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isElementAccessExpression(node.left)
    ) {
        let elemAccess = node.left,
            objName = getExpressionName(elemAccess.expression);

        if (objName && ctx.bindings.get(objName) === 'array') {
            let indexText = elemAccess.argumentExpression.getText(ctx.sourceFile),
                objText = elemAccess.expression.getText(ctx.sourceFile),
                valueText = node.right.getText(ctx.sourceFile);

            ctx.replacements.push({
                end: node.end,
                newText: `${objText}.$set(${indexText}, ${valueText})`,
                start: node.pos
            });
        }
    }

    ts.forEachChild(node, n => visit(ctx, n));
}


const transformReactiveArrays = (sourceFile: ts.SourceFile, bindings: Bindings): string => {
    let code = sourceFile.getFullText(),
        ctx: TransformContext = {
            bindings,
            replacements: [],
            sourceFile
        };

    visit(ctx, sourceFile);

    return applyReplacements(code, ctx.replacements);
};


export { transformReactiveArrays };

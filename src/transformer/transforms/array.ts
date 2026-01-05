import { code as c, type Replacement } from '@esportsplus/typescript/transformer';
import { ts } from '@esportsplus/typescript';
import { COMPILER_TYPE_ARRAY } from '~/constants';
import type { Bindings } from '~/types';


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
        parts.push(current.name.text);
        current = current.expression;
    }

    if (ts.isIdentifier(current)) {
        parts.push(current.text);
        return parts.reverse().join('.');
    }

    return null;
}

function isAssignmentTarget(node: ts.Node): boolean {
    let parent = node.parent;

    return !!parent && (
        (ts.isBinaryExpression(parent) && parent.left === node) ||
        ts.isPostfixUnaryExpression(parent) ||
        ts.isPrefixUnaryExpression(parent)
    );
}

function visit(ctx: { bindings: Bindings, replacements: Replacement[], sourceFile: ts.SourceFile }, node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (ts.isIdentifier(node.initializer) && ctx.bindings.get(node.initializer.text) === COMPILER_TYPE_ARRAY) {
            ctx.bindings.set(node.name.text, COMPILER_TYPE_ARRAY);
        }

        if (ts.isPropertyAccessExpression(node.initializer)) {
            let path = getPropertyPath(node.initializer);

            if (path && ctx.bindings.get(path) === COMPILER_TYPE_ARRAY) {
                ctx.bindings.set(node.name.text, COMPILER_TYPE_ARRAY);
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
                ctx.bindings.set(param.name.text, COMPILER_TYPE_ARRAY);
            }
        }
    }

    if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === 'length' &&
        !isAssignmentTarget(node)
    ) {
        let name = getExpressionName(node.expression);

        if (name && ctx.bindings.get(name) === COMPILER_TYPE_ARRAY) {
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

        if (objName && ctx.bindings.get(objName) === COMPILER_TYPE_ARRAY) {
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


export default (sourceFile: ts.SourceFile, bindings: Bindings, _ns: string): string => {
    let code = sourceFile.getFullText(),
        ctx = {
            bindings,
            replacements: [],
            sourceFile
        };

    visit(ctx, sourceFile);

    return c.replace(code, ctx.replacements);
};
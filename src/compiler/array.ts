import { ts } from '@esportsplus/typescript';
import type { ReplacementIntent } from '@esportsplus/typescript/compiler';
import { COMPOUND_OPERATORS, NAMESPACE, TYPES } from './constants';
import type { Bindings, IsReactiveCall } from './types';
import scope from './bindings';


type VisitContext = {
    bindings: Bindings;
    isReactiveCall: IsReactiveCall;
    replacements: ReplacementIntent[];
    sourceFile: ts.SourceFile;
};


// Pass 1, in source order so an alias (`let b = a`) sees the array it copies: reactive([...])
// declarations, `ReactiveArray`-typed parameters, and aliases of an existing array binding
function declare(ctx: VisitContext, node: ts.Node): void {
    if (ctx.isReactiveCall(node) && node.arguments.length > 0) {
        let arg = node.arguments[0],
            expression = ts.isAsExpression(arg) ? arg.expression : arg;

        if (ts.isArrayLiteralExpression(expression)) {
            let elementType = null;

            if (ts.isAsExpression(arg) && arg.type) {
                elementType = getElementTypeText(arg.type, ctx.sourceFile);
            }
            else if (node.parent && ts.isVariableDeclaration(node.parent) && node.parent.type) {
                elementType = getElementTypeText(node.parent.type, ctx.sourceFile);
            }

            if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
                scope.declare(ctx.bindings, node.parent.name, TYPES.Array);
            }

            let typeParam = elementType ? `<${elementType}>` : '';

            ctx.replacements.push({
                node,
                generate: (sf) => expression.elements.length > 0
                    ? ` new ${NAMESPACE}.ReactiveArray${typeParam}(${expression.getText(sf)})`
                    : ` new ${NAMESPACE}.ReactiveArray${typeParam}()`
            });
        }
    }

    if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        (ts.isIdentifier(node.initializer) || ts.isPropertyAccessExpression(node.initializer)) &&
        scope.isArray(ctx.bindings, node.initializer)
    ) {
        scope.declare(ctx.bindings, node.name, TYPES.Array);
    }

    if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) && node.parameters) {
        for (let i = 0, n = node.parameters.length; i < n; i++) {
            let param = node.parameters[i];

            if (
                ts.isIdentifier(param.name) &&
                param.type &&
                ts.isTypeReferenceNode(param.type) &&
                ts.isIdentifier(param.type.typeName) &&
                param.type.typeName.text === 'ReactiveArray'
            ) {
                scope.declare(ctx.bindings, param.name, TYPES.Array);
            }
        }
    }

    node.forEachChild(child => declare(ctx, child));
}

function getElementTypeText(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): string | null {
    if (ts.isArrayTypeNode(typeNode)) {
        return typeNode.elementType.getText(sourceFile);
    }

    if (
        ts.isTypeReferenceNode(typeNode) &&
        ts.isIdentifier(typeNode.typeName) &&
        typeNode.typeName.text === 'Array' &&
        typeNode.typeArguments &&
        typeNode.typeArguments.length > 0
    ) {
        return typeNode.typeArguments[0].getText(sourceFile);
    }

    return null;
}

// Pass 2: rewrite `.length`, index writes and whole-array reassignment on array bindings only
function rewrite(ctx: VisitContext, node: ts.Node): void {
    if (ts.isTypeNode(node)) {
        return;
    }

    if (ts.isPropertyAccessExpression(node) && node.name.text === 'length' && scope.isArray(ctx.bindings, node.expression)) {
        let expr = node.expression,
            parent = node.parent;

        // arr.length = value OR arr.length += value
        if (parent && ts.isBinaryExpression(parent) && parent.left === node && (parent.operatorToken.kind === ts.SyntaxKind.EqualsToken || COMPOUND_OPERATORS.has(parent.operatorToken.kind))) {
            let op = COMPOUND_OPERATORS.get(parent.operatorToken.kind);

            if (op === undefined) {
                ctx.replacements.push({
                    node: parent,
                    generate: (sf) => `${expr.getText(sf)}.$length = ${parent.right.getText(sf)}`
                });
            }
            else {
                ctx.replacements.push({
                    node: parent,
                    generate: (sf) => `${expr.getText(sf)}.$length = ${expr.getText(sf)}.length ${op} ${parent.right.getText(sf)}`
                });
            }
        }
        // arr.length++ / arr.length-- / ++arr.length / --arr.length
        else if (parent && (ts.isPostfixUnaryExpression(parent) || ts.isPrefixUnaryExpression(parent))) {
            let op = parent.operator === ts.SyntaxKind.PlusPlusToken ? '+' : '-';

            ctx.replacements.push({
                node: parent,
                generate: (sf) => `${expr.getText(sf)}.$length = ${expr.getText(sf)}.length ${op} 1`
            });
        }
        // Read-only: arr.length → arr.$length
        else {
            ctx.replacements.push({
                node,
                generate: (sf) => `${expr.getText(sf)}.$length`
            });
        }
    }

    if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isElementAccessExpression(node.left) &&
        scope.isArray(ctx.bindings, node.left.expression)
    ) {
        let element = node.left;

        ctx.replacements.push({
            node,
            generate: (sf) => `${element.expression.getText(sf)}.$set(
                    ${element.argumentExpression.getText(sf)},
                    ${node.right.getText(sf)}
                )`
        });
    }

    if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left) &&
        scope.isArray(ctx.bindings, node.left)
    ) {
        let name = node.left.text,
            right = node.right;

        // Unwrap "as" expressions: arr = [] as Type[]
        while (ts.isAsExpression(right) || ts.isTypeAssertion(right)) {
            right = right.expression;
        }

        if (ts.isArrayLiteralExpression(right)) {
            let elements = right;

            ctx.replacements.push({
                node,
                generate: (sf) => elements.elements.length > 0
                    ? `${name}.splice(0, ${name}.length, ...${elements.getText(sf)})`
                    : `${name}.splice(0, ${name}.length)`
            });
        }
    }

    node.forEachChild(child => rewrite(ctx, child));
}


export default (sourceFile: ts.SourceFile, bindings: Bindings, isReactiveCall: IsReactiveCall): ReplacementIntent[] => {
    let ctx: VisitContext = {
            bindings,
            isReactiveCall,
            replacements: [],
            sourceFile
        };

    declare(ctx, sourceFile);
    rewrite(ctx, sourceFile);

    return ctx.replacements;
};

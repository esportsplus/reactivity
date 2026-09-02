import { ts } from '@esportsplus/typescript';
import { ast } from '@esportsplus/typescript/compiler';
import type { ReplacementIntent } from '@esportsplus/typescript/compiler';
import { COMPOUND_OPERATORS, NAMESPACE, TYPES } from './constants';
import type { Bindings, IsReactiveCall } from './types';


type VisitContext = {
    bindings: Bindings;
    isReactiveCall: IsReactiveCall;
    replacements: ReplacementIntent[];
    sourceFile: ts.SourceFile;
};


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

function visit(ctx: VisitContext, node: ts.Node): void {
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
                ctx.bindings.set(node.parent.name.text, TYPES.Array);
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

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (ts.isIdentifier(node.initializer) && ctx.bindings.get(node.initializer.text) === TYPES.Array) {
            ctx.bindings.set(node.name.text, TYPES.Array);
        }

        if (ts.isPropertyAccessExpression(node.initializer)) {
            let path = ast.property.path(node.initializer);

            if (path && ctx.bindings.get(path) === TYPES.Array) {
                ctx.bindings.set(node.name.text, TYPES.Array);
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
                ctx.bindings.set(param.name.text, TYPES.Array);
            }
        }
    }

    if (ts.isPropertyAccessExpression(node) && node.name.text === 'length') {
        let name = ast.expression.name(node.expression);

        if (name && ctx.bindings.get(name) === TYPES.Array) {
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
            // arr.length++ or arr.length--
            else if (parent && ts.isPostfixUnaryExpression(parent)) {
                let op = parent.operator === ts.SyntaxKind.PlusPlusToken ? '+' : '-';

                ctx.replacements.push({
                    node: parent,
                    generate: (sf) => `${expr.getText(sf)}.$length = ${expr.getText(sf)}.length ${op} 1`
                });
            }
            // ++arr.length or --arr.length
            else if (parent && ts.isPrefixUnaryExpression(parent)) {
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
    }

    if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isElementAccessExpression(node.left)
    ) {
        let element = node.left,
            name = ast.expression.name(element.expression);

        if (name && ctx.bindings.get(name) === TYPES.Array) {
            ctx.replacements.push({
                node,
                generate: (sf) => `${element.expression.getText(sf)}.$set(
                    ${element.argumentExpression.getText(sf)},
                    ${node.right.getText(sf)}
                )`
            });
        }
    }

    if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left)
    ) {
        let name = node.left.text,
            right = node.right;

        // Unwrap "as" expressions: arr = [] as Type[]
        while (ts.isAsExpression(right) || ts.isTypeAssertion(right)) {
            right = right.expression;
        }

        if (ctx.bindings.get(name) === TYPES.Array && ts.isArrayLiteralExpression(right)) {
            ctx.replacements.push({
                node,
                generate: (sf) => right.elements.length > 0
                    ? `${name}.splice(0, ${name}.length, ...${right.getText(sf)})`
                    : `${name}.splice(0, ${name}.length)`
            });
        }
    }

    node.forEachChild(n => visit(ctx, n));
}


export default (sourceFile: ts.SourceFile, bindings: Bindings, isReactiveCall: IsReactiveCall): ReplacementIntent[] => {
    let ctx: VisitContext = {
            bindings,
            isReactiveCall,
            replacements: [],
            sourceFile
        };

    visit(ctx, sourceFile);

    return ctx.replacements;
};

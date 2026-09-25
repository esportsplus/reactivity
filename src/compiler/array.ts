import { ts } from '@esportsplus/typescript';
import type { ReplacementIntent } from '@esportsplus/typescript/compiler';
import { COMPOUND_OPERATORS, NAMESPACE } from './constants';
import type { Bindings, IsReactiveCall } from './types';
import type { Failure } from './primitives';
import scope from './bindings';


type ArrayTransformResult = {
    failures: Failure[];
    // Whether the output references the runtime namespace (ReactiveArray construction)
    namespaced: boolean;
    // The array expressions found reactive by type
    reactive: ts.Expression[];
    replacements: ReplacementIntent[];
};

// Sites that must go through a ReactiveArray's tracking API when their array is reactive
type Candidates = {
    // `arr.length` reads and writes
    lengths: ts.PropertyAccessExpression[];
    // `arr = [...]`
    reassignments: ts.BinaryExpression[];
    // `arr[i] = v`, `arr[i] op= v`, `arr[i]++`, `delete arr[i]`
    writes: ts.ElementAccessExpression[];
};


function collect(node: ts.Node, candidates: Candidates): void {
    if (ts.isTypeNode(node)) {
        return;
    }

    if (ts.isPropertyAccessExpression(node) && node.name.text === 'length') {
        candidates.lengths.push(node);
    }
    else if (ts.isElementAccessExpression(node) && isWritten(node)) {
        candidates.writes.push(node);
    }
    else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left) &&
        ts.isArrayLiteralExpression(scope.unwrap(node.right))
    ) {
        candidates.reassignments.push(node);
    }

    node.forEachChild(child => collect(child, candidates));
}

// Pass 1: reactive([...]) literals become ReactiveArray instances
function declare(ctx: { isReactiveCall: IsReactiveCall; replacements: ReplacementIntent[]; sourceFile: ts.SourceFile }, node: ts.Node): void {
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

            let typeParam = elementType ? `<${elementType}>` : '';

            ctx.replacements.push({
                node,
                generate: (sf) => expression.elements.length > 0
                    ? ` new ${NAMESPACE}.ReactiveArray${typeParam}(${expression.getText(sf)})`
                    : ` new ${NAMESPACE}.ReactiveArray${typeParam}()`
            });
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

function isWritten(access: ts.ElementAccessExpression): boolean {
    let parent = access.parent;

    if (!parent) {
        return false;
    }

    if (ts.isBinaryExpression(parent)) {
        let op = parent.operatorToken.kind;

        return parent.left === access && (op === ts.SyntaxKind.EqualsToken || COMPOUND_OPERATORS.has(op));
    }

    if (ts.isPostfixUnaryExpression(parent) || ts.isPrefixUnaryExpression(parent)) {
        return parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken;
    }

    return ts.isDeleteExpression(parent);
}

function length(access: ts.PropertyAccessExpression, replacements: ReplacementIntent[]): void {
    let expr = access.expression,
        parent = access.parent;

    // arr.length = value OR arr.length op= value
    if (parent && ts.isBinaryExpression(parent) && parent.left === access && (parent.operatorToken.kind === ts.SyntaxKind.EqualsToken || COMPOUND_OPERATORS.has(parent.operatorToken.kind))) {
        let op = COMPOUND_OPERATORS.get(parent.operatorToken.kind);

        replacements.push({
            node: parent,
            generate: (sf) => op === undefined
                ? `${expr.getText(sf)}.$length = ${parent.right.getText(sf)}`
                : `${expr.getText(sf)}.$length = ${expr.getText(sf)}.length ${op} ${parent.right.getText(sf)}`
        });
    }
    // arr.length++ / arr.length-- / ++arr.length / --arr.length
    else if (parent && (ts.isPostfixUnaryExpression(parent) || ts.isPrefixUnaryExpression(parent))) {
        let op = parent.operator === ts.SyntaxKind.PlusPlusToken ? '+' : '-';

        replacements.push({
            node: parent,
            generate: (sf) => `${expr.getText(sf)}.$length = ${expr.getText(sf)}.length ${op} 1`
        });
    }
    // Read-only: arr.length -> arr.$length
    else {
        replacements.push({
            node: access,
            generate: (sf) => `${expr.getText(sf)}.$length`
        });
    }
}

// An element write must notify, so it goes through $set; operands are evaluated once
function write(access: ts.ElementAccessExpression, ctx: ArrayTransformResult): void {
    let parent = access.parent!,
        array = (sf: ts.SourceFile) => access.expression.getText(sf),
        index = (sf: ts.SourceFile) => access.argumentExpression.getText(sf);

    if (ts.isDeleteExpression(parent)) {
        ctx.failures.push({ message: 'an element of a reactive array cannot be deleted; use splice()', node: parent });
        return;
    }

    if (ts.isBinaryExpression(parent)) {
        let op = COMPOUND_OPERATORS.get(parent.operatorToken.kind),
            right = parent.right;

        ctx.replacements.push({
            node: parent,
            generate: (sf) => op === undefined
                ? `${array(sf)}.$set(${index(sf)}, ${right.getText(sf)})`
                : `((_a, _k) => _a.$set(_k, _a[_k] ${op} (${right.getText(sf)})))(${array(sf)}, ${index(sf)})`
        });

        return;
    }

    let unary = parent as ts.PostfixUnaryExpression | ts.PrefixUnaryExpression,
        op = unary.operator === ts.SyntaxKind.PlusPlusToken ? '+' : '-';

    ctx.replacements.push({
        node: unary,
        generate: (sf) => ts.isPrefixUnaryExpression(unary)
            ? `((_a, _k) => (_a.$set(_k, _a[_k] ${op} 1), _a[_k]))(${array(sf)}, ${index(sf)})`
            : `((_a, _k, _v) => (_a.$set(_k, _v ${op} 1), _v))(${array(sf)}, ${index(sf)}, ${array(sf)}[${index(sf)}])`
    });
}


// Reactive arrays are recognized by type, so `.length` and element writes compile wherever the
// array came from: a local reactive([...]), an import, an object property, a parameter
export default (sourceFile: ts.SourceFile, bindings: Bindings, isReactiveCall: IsReactiveCall): ArrayTransformResult => {
    let candidates: Candidates = { lengths: [], reassignments: [], writes: [] },
        result: ArrayTransformResult = { failures: [], namespaced: false, reactive: [], replacements: [] };

    declare({ isReactiveCall, replacements: result.replacements, sourceFile }, sourceFile);

    result.namespaced = result.replacements.length > 0;
    collect(sourceFile, candidates);

    let reactive = scope.arrays(bindings, [
            ...candidates.lengths.map(access => access.expression),
            ...candidates.reassignments.map(assignment => assignment.left),
            ...candidates.writes.map(access => access.expression)
        ]);

    result.reactive = [...reactive] as ts.Expression[];

    for (let i = 0, n = candidates.lengths.length; i < n; i++) {
        if (reactive.has(candidates.lengths[i].expression)) {
            length(candidates.lengths[i], result.replacements);
        }
    }

    for (let i = 0, n = candidates.writes.length; i < n; i++) {
        if (reactive.has(candidates.writes[i].expression)) {
            write(candidates.writes[i], result);
        }
    }

    // `arr = [...]` refills the same ReactiveArray so everything holding it stays live
    for (let i = 0, n = candidates.reassignments.length; i < n; i++) {
        let assignment = candidates.reassignments[i];

        if (!reactive.has(assignment.left) || isReactiveCall(scope.unwrap(assignment.right))) {
            continue;
        }

        let name = (assignment.left as ts.Identifier).text,
            elements = scope.unwrap(assignment.right) as ts.ArrayLiteralExpression;

        result.replacements.push({
            node: assignment,
            generate: (sf) => elements.elements.length > 0
                ? `${name}.splice(0, ${name}.length, ...${elements.getText(sf)})`
                : `${name}.splice(0, ${name}.length)`
        });
    }

    return result;
};

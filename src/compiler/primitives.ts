import { ts } from '@esportsplus/typescript';
import type { ReplacementIntent } from '@esportsplus/typescript/compiler';
import { COMPOUND_OPERATORS, NAMESPACE, TYPES } from './constants';
import type { Bindings, IsReactiveCall } from './types';
import scope from './bindings';


type PrimitivesTransformResult = {
    calls: ts.CallExpression[];
    replacements: ReplacementIntent[];
};

type TransformContext = {
    bindings: Bindings;
    calls: ts.CallExpression[];
    isReactiveCall: IsReactiveCall;
    replacements: ReplacementIntent[];
    tmpCounter: number;
};


// Pass 1: record every reactive() call and the variable each signal/computed is bound to, before
// any reference is rewritten — a use that precedes its declaration in source order still resolves
function declare(ctx: TransformContext, node: ts.Node): void {
    if (ctx.isReactiveCall(node)) {
        let call = node;

        ctx.calls.push(call);

        if (call.arguments.length > 0) {
            let arg = call.arguments[0],
                classification: TYPES | null = TYPES.Signal;

            if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
                classification = TYPES.Computed;
            }
            else {
                let unwrapped = arg;

                while (ts.isAsExpression(unwrapped) || ts.isParenthesizedExpression(unwrapped) || ts.isTypeAssertion(unwrapped)) {
                    unwrapped = unwrapped.expression;
                }

                if (ts.isArrayLiteralExpression(unwrapped) || ts.isObjectLiteralExpression(unwrapped)) {
                    classification = null;
                }
                // Dynamic expression - use runtime reactive via namespace
                else if (ts.isCallExpression(unwrapped) || ts.isIdentifier(unwrapped)) {
                    classification = null;
                    ctx.replacements.push({
                        generate: () => `${NAMESPACE}.reactive`,
                        node: call.expression
                    });
                }
            }

            if (classification !== null) {
                let target = targetOf(call),
                    type = classification;

                if (target) {
                    scope.declare(ctx.bindings, target, type);
                }

                // Replace just the 'reactive' identifier with the appropriate namespace function
                ctx.replacements.push({
                    generate: () => type === TYPES.Computed
                        ? `${NAMESPACE}.computed`
                        : `${NAMESPACE}.signal`,
                    node: call.expression
                });
            }
        }
    }

    node.forEachChild(child => declare(ctx, child));
}

// A name slot rather than a value reference: a declaration's or member's own name, a property
// name (`o.count`, `{ count: 1 }`, `{ count: local } = o`), or a label. A shorthand property's
// name doubles as a read of the variable, so it is not a name slot. (TS 7's `isDeclarationName`
// only tests the node kind, so it is true for every identifier and cannot be used here.)
function isName(node: ts.Identifier, parent: ts.Node): boolean {
    if (ts.isShorthandPropertyAssignment(parent)) {
        return false;
    }

    let slots = parent as { label?: ts.Node; name?: ts.Node; propertyName?: ts.Node };

    return slots.name === node || slots.propertyName === node || slots.label === node;
}

// Destructuring assignment targets (`({ count } = o)`, `[count] = xs`) write through a pattern
// that has no per-signal rewrite, so they are left untouched
function isPatternTarget(node: ts.Node): boolean {
    let current = node;

    while (
        current.parent &&
        (
            ts.isShorthandPropertyAssignment(current.parent) ||
            ts.isPropertyAssignment(current.parent) ||
            ts.isSpreadAssignment(current.parent) ||
            ts.isSpreadElement(current.parent) ||
            ts.isObjectLiteralExpression(current.parent) ||
            ts.isArrayLiteralExpression(current.parent)
        )
    ) {
        current = current.parent;
    }

    let parent = current.parent;

    if (current === node || !parent) {
        return false;
    }

    return (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && parent.left === current) ||
        ((ts.isForOfStatement(parent) || ts.isForInStatement(parent)) && parent.initializer === current);
}

function reference(ctx: TransformContext, node: ts.Identifier): void {
    let parent = node.parent;

    if (!parent || ts.isExportSpecifier(parent) || ts.isImportSpecifier(parent) || isName(node, parent)) {
        return;
    }

    let binding = scope.resolve(ctx.bindings, node);

    if (!binding || binding.type === TYPES.Array) {
        return;
    }

    if (
        (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && parent.left === node && ctx.isReactiveCall(parent.right)) ||
        (ts.isTypeOfExpression(parent) && parent.expression === node) ||
        isPatternTarget(node)
    ) {
        return;
    }

    let name = node.text;

    if (ts.isShorthandPropertyAssignment(parent)) {
        ctx.replacements.push({
            generate: () => `${name}: ${NAMESPACE}.read(${name})`,
            node: parent
        });

        return;
    }

    let writeCtx: 'compound' | 'increment' | 'simple' | undefined;

    if (ts.isBinaryExpression(parent) && parent.left === node) {
        let op = parent.operatorToken.kind;

        if (op === ts.SyntaxKind.EqualsToken) {
            writeCtx = 'simple';
        }
        else if (COMPOUND_OPERATORS.has(op)) {
            writeCtx = 'compound';
        }
    }
    else if (ts.isPostfixUnaryExpression(parent) || ts.isPrefixUnaryExpression(parent)) {
        let op = parent.operator;

        if (op === ts.SyntaxKind.MinusMinusToken || op === ts.SyntaxKind.PlusPlusToken) {
            writeCtx = 'increment';
        }
    }

    if (!writeCtx) {
        ctx.replacements.push({
            generate: () => `${NAMESPACE}.read(${name})`,
            node
        });

        return;
    }

    if (binding.type === TYPES.Computed) {
        return;
    }

    if (writeCtx === 'simple' && ts.isBinaryExpression(parent)) {
        let right = parent.right;

        ctx.replacements.push({
            generate: (sf) => `${NAMESPACE}.write(${name}, ${right.getText(sf)})`,
            node: parent
        });
    }
    else if (writeCtx === 'compound' && ts.isBinaryExpression(parent)) {
        let op = COMPOUND_OPERATORS.get(parent.operatorToken.kind) ?? '+',
            right = parent.right;

        ctx.replacements.push({
            generate: (sf) => `${NAMESPACE}.write(${name}, ${name}.value ${op} ${right.getText(sf)})`,
            node: parent
        });
    }
    else if (writeCtx === 'increment') {
        let unary = parent as ts.PostfixUnaryExpression | ts.PrefixUnaryExpression,
            delta = unary.operator === ts.SyntaxKind.PlusPlusToken ? '+ 1' : '- 1';

        if (ts.isExpressionStatement(unary.parent)) {
            ctx.replacements.push({
                generate: () => `${NAMESPACE}.write(${name}, ${name}.value ${delta})`,
                node: unary
            });
        }
        else if (ts.isPrefixUnaryExpression(unary)) {
            ctx.replacements.push({
                generate: () => `(${NAMESPACE}.write(${name}, ${name}.value ${delta}), ${name}.value)`,
                node: unary
            });
        }
        else {
            let tmp = `_t${ctx.tmpCounter++}`;

            ctx.replacements.push({
                generate: () => `((${tmp}) => (${NAMESPACE}.write(${name}, ${tmp} ${delta}), ${tmp}))(${name}.value)`,
                node: unary
            });
        }
    }
}

// Pass 2: rewrite reads and writes of every signal/computed binding. Type positions never read a
// value, so they are not walked at all.
function rewrite(ctx: TransformContext, node: ts.Node): void {
    if (ts.isTypeNode(node)) {
        return;
    }

    if (ts.isIdentifier(node)) {
        reference(ctx, node);

        return;
    }

    node.forEachChild(child => rewrite(ctx, child));
}

// The variable a reactive() call initializes: `let x = reactive(...)` or `x = reactive(...)`
function targetOf(call: ts.CallExpression): ts.Identifier | null {
    let parent = call.parent;

    if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name;
    }

    if (parent && ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(parent.left)) {
        return parent.left;
    }

    return null;
}


export default (sourceFile: ts.SourceFile, bindings: Bindings, isReactiveCall: IsReactiveCall): PrimitivesTransformResult => {
    let ctx: TransformContext = {
            bindings,
            calls: [],
            isReactiveCall,
            replacements: [],
            tmpCounter: 0
        };

    declare(ctx, sourceFile);
    rewrite(ctx, sourceFile);

    return { calls: ctx.calls, replacements: ctx.replacements };
};

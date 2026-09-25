import { ts } from '@esportsplus/typescript';
import type { ReplacementIntent } from '@esportsplus/typescript/compiler';
import { COMPOUND_OPERATORS, NAMESPACE, TYPES } from './constants';
import type { Bindings, IsReactiveCall } from './types';
import scope from './bindings';


// Something the compiler cannot lower; reported (every one of them) as a build error
type Failure = { message: string; node: ts.Node };

type PrimitivesTransformResult = {
    calls: ts.CallExpression[];
    failures: Failure[];
    replacements: ReplacementIntent[];
};

type TransformContext = {
    bindings: Bindings;
    calls: ts.CallExpression[];
    failures: Failure[];
    isReactiveCall: IsReactiveCall;
    replacements: ReplacementIntent[];
    tmpCounter: number;
};


// Pass 1: lower every reactive() call. A signal or computed is only ever reached through the
// variable it initializes (every read of that variable is rewritten), so anywhere else its signal
// would leak unread and the call is rejected.
function declare(ctx: TransformContext, node: ts.Node): void {
    if (ctx.isReactiveCall(node)) {
        let call = node,
            kind = scope.classify(ctx.bindings, call);

        ctx.calls.push(call);

        if (kind === null) {
            ctx.failures.push({
                message: 'reactive() takes one argument whose kind (value, computed, array or object) is provable; ' +
                    'pass a literal or give the argument a concrete type (not any, unknown or a mixed union)',
                node: call
            });
        }
        else if (kind === TYPES.Signal || kind === TYPES.Computed) {
            if (!isBound(call)) {
                ctx.failures.push({
                    message: `a reactive ${kind === TYPES.Signal ? 'value' : 'computed'} must initialize a variable (or be a module's ` +
                        'default export); anywhere else its signal is never read',
                    node: call
                });
            }

            ctx.replacements.push({
                generate: () => kind === TYPES.Computed ? `${NAMESPACE}.computed` : `${NAMESPACE}.signal`,
                node: call.expression
            });
        }
        else {
            let arg = scope.unwrap(call.arguments[0]);

            // Literals are lowered by the array and object transforms; any other array or object
            // is built by the runtime constructor
            if (!ts.isArrayLiteralExpression(arg) && !ts.isObjectLiteralExpression(arg)) {
                ctx.replacements.push({
                    generate: () => `${NAMESPACE}.reactive`,
                    node: call.expression
                });
            }
        }
    }

    node.forEachChild(child => declare(ctx, child));
}

// `let x = reactive(...)`, `x = reactive(...)` or `export default reactive(...)`
function isBound(call: ts.CallExpression): boolean {
    let node: ts.Node = call,
        parent = node.parent;

    while (
        parent &&
        (ts.isAsExpression(parent) || ts.isNonNullExpression(parent) || ts.isParenthesizedExpression(parent) || ts.isSatisfiesExpression(parent))
    ) {
        node = parent;
        parent = node.parent;
    }

    if (!parent) {
        return false;
    }

    if (ts.isVariableDeclaration(parent)) {
        return parent.initializer === node && ts.isIdentifier(parent.name);
    }

    if (ts.isBinaryExpression(parent)) {
        return parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && parent.right === node && ts.isIdentifier(parent.left);
    }

    return ts.isExportAssignment(parent);
}

// A module namespace object: `import * as ns` (or an alias of it) or an `await import(...)`
function isNamespace(bindings: Bindings, expression: ts.Expression): boolean {
    let value = scope.unwrap(expression);

    if (ts.isAwaitExpression(value)) {
        value = scope.unwrap(value.expression);
    }

    if (ts.isCallExpression(value)) {
        return value.expression.kind === ts.SyntaxKind.ImportKeyword;
    }

    return ts.isIdentifier(value) && scope.origin(bindings, value)?.declaration.kind === ts.SyntaxKind.SourceFile;
}

// Destructuring assignment targets (`({ count } = o)`, `[count] = xs`) write through a pattern
// that has no per-signal rewrite
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

// A binding read as `ns.count` / `ns['count']` is rewritten as a whole
function readNode(identifier: ts.Node): ts.Expression {
    let parent = identifier.parent!;

    if (
        (ts.isPropertyAccessExpression(parent) && parent.name === identifier) ||
        (ts.isElementAccessExpression(parent) && parent.argumentExpression === identifier)
    ) {
        return parent;
    }

    return identifier as ts.Expression;
}

function reference(ctx: TransformContext, node: ts.Expression, kind: TYPES): void {
    let parent = node.parent;

    if (!parent) {
        return;
    }

    // `x = reactive(...)` replaces the signal itself
    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && parent.left === node && ctx.isReactiveCall(scope.unwrap(parent.right))) {
        return;
    }

    if (isPatternTarget(node)) {
        ctx.failures.push({ message: 'a reactive binding cannot be assigned through a destructuring pattern; assign it directly', node });
        return;
    }

    let text = node.getText(ctx.bindings.sourceFile);

    if (ts.isShorthandPropertyAssignment(parent)) {
        ctx.replacements.push({
            generate: () => `${text}: ${NAMESPACE}.read(${text})`,
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
            generate: () => `${NAMESPACE}.read(${text})`,
            node
        });

        return;
    }

    if (kind === TYPES.Computed) {
        ctx.failures.push({ message: 'a reactive computed is read-only', node });
        return;
    }

    if (writeCtx === 'simple' && ts.isBinaryExpression(parent)) {
        let right = parent.right;

        ctx.replacements.push({
            generate: (sf) => `${NAMESPACE}.write(${text}, ${right.getText(sf)})`,
            node: parent
        });
    }
    else if (writeCtx === 'compound' && ts.isBinaryExpression(parent)) {
        let op = COMPOUND_OPERATORS.get(parent.operatorToken.kind) ?? '+',
            right = parent.right;

        ctx.replacements.push({
            generate: (sf) => `${NAMESPACE}.write(${text}, ${text}.value ${op} ${right.getText(sf)})`,
            node: parent
        });
    }
    else if (writeCtx === 'increment') {
        let unary = parent as ts.PostfixUnaryExpression | ts.PrefixUnaryExpression,
            delta = unary.operator === ts.SyntaxKind.PlusPlusToken ? '+ 1' : '- 1';

        if (ts.isExpressionStatement(unary.parent)) {
            ctx.replacements.push({
                generate: () => `${NAMESPACE}.write(${text}, ${text}.value ${delta})`,
                node: unary
            });
        }
        else if (ts.isPrefixUnaryExpression(unary)) {
            ctx.replacements.push({
                generate: () => `(${NAMESPACE}.write(${text}, ${text}.value ${delta}), ${text}.value)`,
                node: unary
            });
        }
        else {
            let tmp = `_t${ctx.tmpCounter++}`;

            ctx.replacements.push({
                generate: () => `((${tmp}) => (${NAMESPACE}.write(${text}, ${tmp} ${delta}), ${tmp}))(${text}.value)`,
                node: unary
            });
        }
    }
}

// Pass 2: rewrite every read and write of a signal or computed binding, resolved by declaration so
// a binding imported from another module (named, default, namespace, through a barrel) compiles
// exactly like a local one. Destructuring one out of a module namespace would copy its signal.
function rewrite(ctx: TransformContext): void {
    let { bindings } = ctx;

    for (let [identifier, found] of bindings.origins) {
        let kind = scope.kind(bindings, found);

        if (kind !== TYPES.Signal && kind !== TYPES.Computed) {
            continue;
        }

        let parent = identifier.parent!;

        if (ts.isBindingElement(parent) && parent.propertyName === identifier) {
            ctx.failures.push({ message: 'a reactive binding cannot be destructured (it would copy its signal); read it through the namespace', node: identifier });
            continue;
        }

        reference(ctx, readNode(identifier), kind);
    }

    unpacked(ctx, bindings.sourceFile);
}

// `const { count } = ns` names no property to resolve, so each element of a pattern destructuring
// a module namespace is resolved as the export it copies
function unpacked(ctx: TransformContext, node: ts.Node): void {
    if (ts.isBindingElement(node) && !node.propertyName && ts.isObjectBindingPattern(node.parent)) {
        let initializer = (node.parent.parent as { initializer?: ts.Expression }).initializer;

        if (initializer && isNamespace(ctx.bindings, initializer)) {
            let kind = scope.kind(ctx.bindings, scope.origin(ctx.bindings, node));

            if (kind === TYPES.Signal || kind === TYPES.Computed) {
                ctx.failures.push({ message: 'a reactive binding cannot be destructured (it would copy its signal); read it through the namespace', node });
            }
        }
    }

    node.forEachChild(child => unpacked(ctx, child));
}


export default (sourceFile: ts.SourceFile, bindings: Bindings, isReactiveCall: IsReactiveCall): PrimitivesTransformResult => {
    let ctx: TransformContext = {
            bindings,
            calls: [],
            failures: [],
            isReactiveCall,
            replacements: [],
            tmpCounter: 0
        };

    declare(ctx, sourceFile);
    rewrite(ctx);

    return { calls: ctx.calls, failures: ctx.failures, replacements: ctx.replacements };
};
export type { Failure };

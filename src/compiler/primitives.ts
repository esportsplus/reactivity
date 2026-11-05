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

// A binding element of a pattern destructuring `initializer`
type Unpacked = {
    element: ts.BindingElement;
    initializer: ts.Expression;
};


// Every reactive() call, in source order
function calls(ctx: TransformContext, node: ts.Node, found: ts.CallExpression[]): void {
    if (ctx.isReactiveCall(node)) {
        found.push(node);
    }

    node.forEachChild(child => calls(ctx, child, found));
}

// Pass 1: lower every reactive() call. A signal or computed is only ever reached through the
// variable it initializes (every read of that variable is rewritten), so anywhere else its signal
// would leak unread and the call is rejected.
async function declare(ctx: TransformContext, sourceFile: ts.SourceFile): Promise<void> {
    let found: ts.CallExpression[] = [];

    calls(ctx, sourceFile, found);

    let kinds = await Promise.all(found.map((call) => scope.classify(ctx.bindings, call)));

    for (let i = 0, n = found.length; i < n; i++) {
        let call = found[i],
            kind = kinds[i];

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
async function isNamespace(bindings: Bindings, expression: ts.Expression): Promise<boolean> {
    let value = scope.unwrap(expression);

    if (ts.isAwaitExpression(value)) {
        value = scope.unwrap(value.expression);
    }

    if (ts.isCallExpression(value)) {
        return value.expression.kind === ts.SyntaxKind.ImportKeyword;
    }

    return ts.isIdentifier(value) && (await scope.origin(bindings, value))?.declaration.kind === ts.SyntaxKind.SourceFile;
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

// A binding read as `ns.count` / `ns['count']` is rewritten as a whole; in `list[count]` the key is
// the read
function readNode(identifier: ts.Node): ts.Expression {
    let parent = identifier.parent!;

    if (
        (ts.isPropertyAccessExpression(parent) && parent.name === identifier) ||
        (ts.isElementAccessExpression(parent) && parent.argumentExpression === identifier && (ts.isStringLiteral(identifier) || ts.isNoSubstitutionTemplateLiteral(identifier)))
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

    // The binding itself (`count`, `ns.count`, `ns['count']`) holds nothing another rewrite replaces,
    // so its source is copied as is: text() walks the file's intents on every call
    let binding = node.getText(ctx.bindings.sourceFile);

    if (ts.isShorthandPropertyAssignment(parent)) {
        ctx.replacements.push({
            generate: () => `${binding}: ${NAMESPACE}.read(${binding})`,
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
            generate: () => `${NAMESPACE}.read(${binding})`,
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
            generate: (_sourceFile, text) => `${NAMESPACE}.write(${binding}, ${text(right)})`,
            node: parent
        });
    }
    else if (writeCtx === 'compound' && ts.isBinaryExpression(parent)) {
        let op = COMPOUND_OPERATORS.get(parent.operatorToken.kind) ?? '+',
            right = parent.right;

        ctx.replacements.push({
            generate: (_sourceFile, text) => `${NAMESPACE}.write(${binding}, ${binding}.value ${op} ${text(right)})`,
            node: parent
        });
    }
    else if (writeCtx === 'increment') {
        let unary = parent as ts.PostfixUnaryExpression | ts.PrefixUnaryExpression,
            delta = unary.operator === ts.SyntaxKind.PlusPlusToken ? '+ 1' : '- 1';

        if (ts.isExpressionStatement(unary.parent)) {
            ctx.replacements.push({
                generate: () => `${NAMESPACE}.write(${binding}, ${binding}.value ${delta})`,
                node: unary
            });
        }
        else if (ts.isPrefixUnaryExpression(unary)) {
            ctx.replacements.push({
                generate: () => `(${NAMESPACE}.write(${binding}, ${binding}.value ${delta}), ${binding}.value)`,
                node: unary
            });
        }
        else {
            let tmp = `_t${ctx.tmpCounter++}`;

            ctx.replacements.push({
                generate: () => `((${tmp}) => (${NAMESPACE}.write(${binding}, ${tmp} ${delta}), ${tmp}))(${binding}.value)`,
                node: unary
            });
        }
    }
}

// Pass 2: rewrite every read and write of a signal or computed binding, resolved by declaration so
// a binding imported from another module (named, default, namespace, through a barrel) compiles
// exactly like a local one. Destructuring one out of a module namespace would copy its signal.
async function rewrite(ctx: TransformContext): Promise<void> {
    let { bindings } = ctx,
        origins = [...bindings.origins],
        kinds = await Promise.all(origins.map(([, found]) => scope.kind(bindings, found)));

    for (let i = 0, n = origins.length; i < n; i++) {
        let [identifier] = origins[i],
            kind = kinds[i];

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

    let elements: Unpacked[] = [];

    unpacked(bindings.sourceFile, elements);

    let copied = await Promise.all(elements.map(async ({ element, initializer }) => {
        if (!(await isNamespace(bindings, initializer))) {
            return false;
        }

        let kind = await scope.kind(bindings, await scope.origin(bindings, element));

        return kind === TYPES.Signal || kind === TYPES.Computed;
    }));

    for (let i = 0, n = elements.length; i < n; i++) {
        if (copied[i]) {
            ctx.failures.push({ message: 'a reactive binding cannot be destructured (it would copy its signal); read it through the namespace', node: elements[i].element });
        }
    }
}

// `const { count } = ns` names no property to resolve, so each element of a pattern destructuring
// an initializer (a module namespace, once resolved) is resolved as the export it copies
function unpacked(node: ts.Node, found: Unpacked[]): void {
    if (ts.isBindingElement(node) && !node.propertyName && ts.isObjectBindingPattern(node.parent)) {
        let initializer = (node.parent.parent as { initializer?: ts.Expression }).initializer;

        if (initializer) {
            found.push({ element: node, initializer });
        }
    }

    node.forEachChild(child => unpacked(child, found));
}


export default async (sourceFile: ts.SourceFile, bindings: Bindings, isReactiveCall: IsReactiveCall): Promise<PrimitivesTransformResult> => {
    let ctx: TransformContext = {
            bindings,
            calls: [],
            failures: [],
            isReactiveCall,
            replacements: [],
            tmpCounter: 0
        };

    await declare(ctx, sourceFile);
    await rewrite(ctx);

    return { calls: ctx.calls, failures: ctx.failures, replacements: ctx.replacements };
};
export type { Failure };

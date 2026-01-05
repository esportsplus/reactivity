import { uid } from '@esportsplus/typescript/transformer';
import type { BindingType, Bindings } from '~/types';
import {
    createCommaExpr,
    createComputedCall,
    createPostfixIncrementExpr,
    createReadCall,
    createSetCall,
    createSignalCall
} from '../factory';
import { ts } from '@esportsplus/typescript';


interface ScopeBinding {
    name: string;
    scope: ts.Node;
    type: BindingType;
}

interface TransformContext {
    bindings: Bindings;
    context: ts.TransformationContext;
    factory: ts.NodeFactory;
    hasReactiveImport: boolean;
    neededImports: Set<string>;
    scopedBindings: ScopeBinding[];
}


function classifyReactiveArg(arg: ts.Expression): 'computed' | 'signal' | null {
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
        return 'computed';
    }

    if (ts.isObjectLiteralExpression(arg) || ts.isArrayLiteralExpression(arg)) {
        return null;
    }

    return 'signal';
}

function findBinding(bindings: ScopeBinding[], name: string, node: ts.Node): ScopeBinding | undefined {
    for (let i = 0, n = bindings.length; i < n; i++) {
        let b = bindings[i];

        if (b.name === name && isInScope(node, b)) {
            return b;
        }
    }

    return undefined;
}

function findEnclosingScope(node: ts.Node): ts.Node {
    let current = node.parent;

    while (current) {
        if (
            ts.isArrowFunction(current) ||
            ts.isBlock(current) ||
            ts.isForInStatement(current) ||
            ts.isForOfStatement(current) ||
            ts.isForStatement(current) ||
            ts.isFunctionDeclaration(current) ||
            ts.isFunctionExpression(current) ||
            ts.isSourceFile(current)
        ) {
            return current;
        }

        current = current.parent;
    }

    return node.getSourceFile();
}

function getCompoundOperator(kind: ts.SyntaxKind): ts.BinaryOperator {
    if (kind === ts.SyntaxKind.PlusEqualsToken) {
        return ts.SyntaxKind.PlusToken;
    }
    else if (kind === ts.SyntaxKind.MinusEqualsToken) {
        return ts.SyntaxKind.MinusToken;
    }
    else if (kind === ts.SyntaxKind.AsteriskEqualsToken) {
        return ts.SyntaxKind.AsteriskToken;
    }
    else if (kind === ts.SyntaxKind.SlashEqualsToken) {
        return ts.SyntaxKind.SlashToken;
    }
    else if (kind === ts.SyntaxKind.PercentEqualsToken) {
        return ts.SyntaxKind.PercentToken;
    }
    else if (kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken) {
        return ts.SyntaxKind.AsteriskAsteriskToken;
    }
    else if (kind === ts.SyntaxKind.AmpersandEqualsToken) {
        return ts.SyntaxKind.AmpersandToken;
    }
    else if (kind === ts.SyntaxKind.BarEqualsToken) {
        return ts.SyntaxKind.BarToken;
    }
    else if (kind === ts.SyntaxKind.CaretEqualsToken) {
        return ts.SyntaxKind.CaretToken;
    }
    else if (kind === ts.SyntaxKind.LessThanLessThanEqualsToken) {
        return ts.SyntaxKind.LessThanLessThanToken;
    }
    else if (kind === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken) {
        return ts.SyntaxKind.GreaterThanGreaterThanToken;
    }
    else if (kind === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken) {
        return ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken;
    }
    else if (kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken) {
        return ts.SyntaxKind.AmpersandAmpersandToken;
    }
    else if (kind === ts.SyntaxKind.BarBarEqualsToken) {
        return ts.SyntaxKind.BarBarToken;
    }
    else if (kind === ts.SyntaxKind.QuestionQuestionEqualsToken) {
        return ts.SyntaxKind.QuestionQuestionToken;
    }
    else {
        return ts.SyntaxKind.PlusToken;
    }
}

function isAssignmentOperator(kind: ts.SyntaxKind): 'compound' | 'simple' | false {
    if (kind === ts.SyntaxKind.EqualsToken) {
        return 'simple';
    }

    if (kind >= ts.SyntaxKind.PlusEqualsToken && kind <= ts.SyntaxKind.CaretEqualsToken) {
        return 'compound';
    }

    if (
        kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
        kind === ts.SyntaxKind.BarBarEqualsToken ||
        kind === ts.SyntaxKind.QuestionQuestionEqualsToken
    ) {
        return 'compound';
    }

    return false;
}

function isInDeclarationInit(node: ts.Node | undefined): boolean {
    if (!node || !node.parent) {
        return false;
    }

    let parent = node.parent;

    if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
        return true;
    }

    return false;
}

function isInScope(reference: ts.Node, binding: ScopeBinding): boolean {
    let current: ts.Node | undefined = reference;

    while (current) {
        if (current === binding.scope) {
            return true;
        }

        current = current.parent;
    }

    return false;
}

function isReactiveReassignment(node: ts.BinaryExpression): boolean {
    let right = node.right;

    if (
        ts.isCallExpression(right) &&
        ts.isIdentifier(right.expression) &&
        right.expression.text === 'reactive'
    ) {
        return true;
    }

    return false;
}

function visit(ctx: TransformContext, node: ts.Node): ts.Node {
    // Check for reactive import
    if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text.includes('@esportsplus/reactivity')
    ) {
        let clause = node.importClause;

        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
            for (let i = 0, n = clause.namedBindings.elements.length; i < n; i++) {
                if (clause.namedBindings.elements[i].name.text === 'reactive') {
                    ctx.hasReactiveImport = true;
                    break;
                }
            }
        }
    }

    // Transform reactive() calls to signal() or computed()
    if (
        ctx.hasReactiveImport &&
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'reactive' &&
        node.arguments.length > 0
    ) {
        let arg = node.arguments[0],
            classification = classifyReactiveArg(arg);

        if (classification) {
            let varName: string | null = null;

            if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
                varName = node.parent.name.text;
            }
            else if (
                node.parent &&
                ts.isBinaryExpression(node.parent) &&
                node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                ts.isIdentifier(node.parent.left)
            ) {
                varName = node.parent.left.text;
            }

            if (varName) {
                let scope = findEnclosingScope(node);

                ctx.bindings.set(varName, classification);
                ctx.scopedBindings.push({ name: varName, scope, type: classification });
            }

            if (classification === 'computed') {
                ctx.neededImports.add('computed');

                // Transform the function body to wrap reactive reads
                let transformedArg = ts.visitEachChild(arg, n => visitComputedArg(ctx, n), ctx.context);

                return createComputedCall(ctx.factory, transformedArg as ts.Expression);
            }
            else {
                ctx.neededImports.add('signal');

                return createSignalCall(ctx.factory, arg);
            }
        }
    }

    // Handle binary expressions (assignments) with reactive left side
    if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left)) {
        let assignType = isAssignmentOperator(node.operatorToken.kind);

        if (assignType) {
            let binding = findBinding(ctx.scopedBindings, node.left.text, node.left);

            if (binding && binding.type !== 'computed' && !isReactiveReassignment(node)) {
                ctx.neededImports.add('set');

                let factory = ctx.factory,
                    name = node.left.text,
                    signalIdent = factory.createIdentifier(name),
                    transformedRight = ts.visitEachChild(node.right, n => visit(ctx, n), ctx.context) as ts.Expression;

                if (assignType === 'simple') {
                    // x = value → set(x, value)
                    return createSetCall(factory, signalIdent, transformedRight);
                }
                else {
                    // x += value → set(x, x.value + value)
                    let op = getCompoundOperator(node.operatorToken.kind),
                        valueAccess = factory.createPropertyAccessExpression(signalIdent, 'value');

                    return createSetCall(
                        factory,
                        signalIdent,
                        factory.createBinaryExpression(valueAccess, op, transformedRight)
                    );
                }
            }
        }
    }

    // Handle prefix unary expressions (++x, --x) with reactive operand
    if (ts.isPrefixUnaryExpression(node) && ts.isIdentifier(node.operand)) {
        let op = node.operator;

        if (op === ts.SyntaxKind.PlusPlusToken || op === ts.SyntaxKind.MinusMinusToken) {
            let binding = findBinding(ctx.scopedBindings, node.operand.text, node.operand);

            if (binding && binding.type !== 'computed') {
                ctx.neededImports.add('set');

                let delta = op === ts.SyntaxKind.PlusPlusToken ? ts.SyntaxKind.PlusToken : ts.SyntaxKind.MinusToken,
                    factory = ctx.factory,
                    name = node.operand.text,
                    signalIdent = factory.createIdentifier(name),
                    valueAccess = factory.createPropertyAccessExpression(signalIdent, 'value');

                if (node.parent && ts.isExpressionStatement(node.parent)) {
                    // ++x as statement → set(x, x.value + 1)
                    return createSetCall(
                        factory,
                        signalIdent,
                        factory.createBinaryExpression(valueAccess, delta, factory.createNumericLiteral(1))
                    );
                }
                else {
                    // ++x in expression → (set(x, x.value + 1), x.value)
                    return createCommaExpr(
                        factory,
                        createSetCall(
                            factory,
                            signalIdent,
                            factory.createBinaryExpression(valueAccess, delta, factory.createNumericLiteral(1))
                        ),
                        factory.createPropertyAccessExpression(factory.createIdentifier(name), 'value')
                    );
                }
            }
        }
    }

    // Handle postfix unary expressions (x++, x--) with reactive operand
    if (ts.isPostfixUnaryExpression(node) && ts.isIdentifier(node.operand)) {
        let op = node.operator;

        if (op === ts.SyntaxKind.PlusPlusToken || op === ts.SyntaxKind.MinusMinusToken) {
            let binding = findBinding(ctx.scopedBindings, node.operand.text, node.operand);

            if (binding && binding.type !== 'computed') {
                ctx.neededImports.add('set');

                let delta = op === ts.SyntaxKind.PlusPlusToken ? ts.SyntaxKind.PlusToken : ts.SyntaxKind.MinusToken,
                    factory = ctx.factory,
                    name = node.operand.text,
                    signalIdent = factory.createIdentifier(name),
                    valueAccess = factory.createPropertyAccessExpression(signalIdent, 'value');

                if (node.parent && ts.isExpressionStatement(node.parent)) {
                    // x++ as statement → set(x, x.value + 1)
                    return createSetCall(
                        factory,
                        signalIdent,
                        factory.createBinaryExpression(valueAccess, delta, factory.createNumericLiteral(1))
                    );
                }
                else {
                    // x++ in expression → ((tmp) => (set(x, tmp + 1), tmp))(x.value)
                    return createPostfixIncrementExpr(factory, uid('tmp'), name, delta);
                }
            }
        }
    }

    // Handle reactive variable reads (not in write context)
    if (ts.isIdentifier(node) && node.parent && !isInDeclarationInit(node.parent)) {
        // Skip property names in property access expressions
        if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) {
            return ts.visitEachChild(node, n => visit(ctx, n), ctx.context);
        }

        // Skip if this identifier is the left side of an assignment (handled above)
        if (ts.isBinaryExpression(node.parent) && node.parent.left === node) {
            return ts.visitEachChild(node, n => visit(ctx, n), ctx.context);
        }

        // Skip if this is the operand of a unary expression (handled above)
        if (
            (ts.isPrefixUnaryExpression(node.parent) || ts.isPostfixUnaryExpression(node.parent)) &&
            node.parent.operand === node
        ) {
            return ts.visitEachChild(node, n => visit(ctx, n), ctx.context);
        }

        // Skip typeof checks
        if (ts.isTypeOfExpression(node.parent) && node.parent.expression === node) {
            return ts.visitEachChild(node, n => visit(ctx, n), ctx.context);
        }

        let binding = findBinding(ctx.scopedBindings, node.text, node);

        if (binding) {
            // Read access → read(x)
            ctx.neededImports.add('read');

            return createReadCall(ctx.factory, ctx.factory.createIdentifier(node.text));
        }
    }

    return ts.visitEachChild(node, n => visit(ctx, n), ctx.context);
}

function visitComputedArg(ctx: TransformContext, node: ts.Node): ts.Node {
    // Skip property names in property access
    if (ts.isIdentifier(node) && node.parent) {
        if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) {
            return ts.visitEachChild(node, n => visitComputedArg(ctx, n), ctx.context);
        }

        // Skip function call expressions
        if (ts.isCallExpression(node.parent) && node.parent.expression === node) {
            return ts.visitEachChild(node, n => visitComputedArg(ctx, n), ctx.context);
        }

        let binding = findBinding(ctx.scopedBindings, node.text, node);

        if (binding) {
            ctx.neededImports.add('read');

            return createReadCall(ctx.factory, ctx.factory.createIdentifier(node.text));
        }
    }

    return ts.visitEachChild(node, n => visitComputedArg(ctx, n), ctx.context);
}


const createPrimitivesTransformer = (
    bindings: Bindings,
    neededImports: Set<string>
): (context: ts.TransformationContext) => (sourceFile: ts.SourceFile) => ts.SourceFile => {
    return (context: ts.TransformationContext) => {
        return (sourceFile: ts.SourceFile): ts.SourceFile => {
            let ctx: TransformContext = {
                bindings,
                context,
                factory: context.factory,
                hasReactiveImport: false,
                neededImports,
                scopedBindings: []
            };

            return ts.visitNode(sourceFile, n => visit(ctx, n)) as ts.SourceFile;
        };
    };
};


export { createPrimitivesTransformer };

import type { ReplacementIntent } from '@esportsplus/typescript/compiler';
import { ts } from '@esportsplus/typescript';
import { COMPILER_NAMESPACE, COMPILER_TYPES } from '~/constants';
import type { Bindings } from '~/types';


interface ScopeBinding {
    name: string;
    scope: ts.Node;
    type: COMPILER_TYPES;
}

interface TransformContext {
    bindings: Bindings;
    isReactiveCall: (node: ts.Node) => boolean;
    replacements: ReplacementIntent[];
    scopedBindings: ScopeBinding[];
    sourceFile: ts.SourceFile;
    tmpCounter: number;
}


const COMPOUND_OPERATORS = new Map<ts.SyntaxKind, string>([
    [ts.SyntaxKind.AmpersandAmpersandEqualsToken, '&&'],
    [ts.SyntaxKind.AmpersandEqualsToken, '&'],
    [ts.SyntaxKind.AsteriskAsteriskEqualsToken, '**'],
    [ts.SyntaxKind.AsteriskEqualsToken, '*'],
    [ts.SyntaxKind.BarBarEqualsToken, '||'],
    [ts.SyntaxKind.BarEqualsToken, '|'],
    [ts.SyntaxKind.CaretEqualsToken, '^'],
    [ts.SyntaxKind.GreaterThanGreaterThanEqualsToken, '>>'],
    [ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken, '>>>'],
    [ts.SyntaxKind.LessThanLessThanEqualsToken, '<<'],
    [ts.SyntaxKind.MinusEqualsToken, '-'],
    [ts.SyntaxKind.PercentEqualsToken, '%'],
    [ts.SyntaxKind.PlusEqualsToken, '+'],
    [ts.SyntaxKind.QuestionQuestionEqualsToken, '??'],
    [ts.SyntaxKind.SlashEqualsToken, '/']
]);


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

function visit(ctx: TransformContext, node: ts.Node): void {
    if (ctx.isReactiveCall(node)) {
        let call = node as ts.CallExpression;

        if (call.arguments.length > 0) {
            let arg = call.arguments[0],
                classification: COMPILER_TYPES | null = COMPILER_TYPES.Signal;

            if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
                classification = COMPILER_TYPES.Computed;
            }
            else if (ts.isArrayLiteralExpression(arg) || ts.isObjectLiteralExpression(arg)) {
                classification = null;
            }

            if (classification) {
                let varName: string | null = null;

                if (call.parent && ts.isVariableDeclaration(call.parent) && ts.isIdentifier(call.parent.name)) {
                    varName = call.parent.name.text;
                }
                else if (
                    call.parent &&
                    ts.isBinaryExpression(call.parent) &&
                    call.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                    ts.isIdentifier(call.parent.left)
                ) {
                    varName = call.parent.left.text;
                }

                if (varName) {
                    let current = call.parent,
                        scope;

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
                            scope = current;
                        }

                        current = current.parent;
                    }

                    if (!scope) {
                        scope = call.getSourceFile();
                    }

                    ctx.scopedBindings.push({ name: varName, scope, type: classification });
                    ctx.bindings.set(varName, classification);
                }

                // Replace just the 'reactive' identifier with the appropriate namespace function
                ctx.replacements.push({
                    generate: () => classification === COMPILER_TYPES.Computed
                        ? `${COMPILER_NAMESPACE}.computed`
                        : `${COMPILER_NAMESPACE}.signal`,
                    node: call.expression
                });

                // Continue visiting children - inner identifiers will get their own ReplacementIntents
            }
        }
    }

    if (
        ts.isIdentifier(node) &&
        node.parent &&
        !(ts.isVariableDeclaration(node.parent) && node.parent.name === node)
    ) {
        if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) {
            ts.forEachChild(node, n => visit(ctx, n));
            return;
        }

        let bindings = ctx.scopedBindings,
            binding,
            name = node.text;

        for (let i = 0, n = bindings.length; i < n; i++) {
            let b = bindings[i];

            if (b.name === name && isInScope(node, b)) {
                binding = b;
            }
        }

        if (binding && node.parent) {
            let parent = node.parent;

            if (
                !(
                    ts.isBinaryExpression(parent) &&
                    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                    ctx.isReactiveCall(parent.right)
                ) &&
                !(ts.isTypeOfExpression(parent) && parent.expression === node)
            ) {
                let writeCtx;

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

                if (writeCtx) {
                    if (binding.type !== COMPILER_TYPES.Computed) {
                        if (writeCtx === 'simple' && ts.isBinaryExpression(parent)) {
                            let right = parent.right;

                            ctx.replacements.push({
                                generate: (sf) => `${COMPILER_NAMESPACE}.write(${name}, ${right.getText(sf)})`,
                                node: parent
                            });
                        }
                        else if (writeCtx === 'compound' && ts.isBinaryExpression(parent)) {
                            let op = COMPOUND_OPERATORS.get(parent.operatorToken.kind) ?? '+',
                                right = parent.right;

                            ctx.replacements.push({
                                generate: (sf) => `${COMPILER_NAMESPACE}.write(${name}, ${name}.value ${op} ${right.getText(sf)})`,
                                node: parent
                            });
                        }
                        else if (writeCtx === 'increment') {
                            let delta = (parent as ts.PostfixUnaryExpression | ts.PrefixUnaryExpression).operator === ts.SyntaxKind.PlusPlusToken ? '+ 1' : '- 1',
                                isPrefix = ts.isPrefixUnaryExpression(parent);

                            if (ts.isExpressionStatement(parent.parent)) {
                                ctx.replacements.push({
                                    generate: () => `${COMPILER_NAMESPACE}.write(${name}, ${name}.value ${delta})`,
                                    node: parent
                                });
                            }
                            else if (isPrefix) {
                                ctx.replacements.push({
                                    generate: () => `(${COMPILER_NAMESPACE}.write(${name}, ${name}.value ${delta}), ${name}.value)`,
                                    node: parent
                                });
                            }
                            else {
                                let tmp = `_t${ctx.tmpCounter++}`;

                                ctx.replacements.push({
                                    generate: () => `((${tmp}) => (${COMPILER_NAMESPACE}.write(${name}, ${tmp} ${delta}), ${tmp}))(${name}.value)`,
                                    node: parent
                                });
                            }
                        }
                    }
                }
                else {
                    ctx.replacements.push({
                        generate: () => `${COMPILER_NAMESPACE}.read(${name})`,
                        node
                    });
                }
            }
        }
    }

    ts.forEachChild(node, n => visit(ctx, n));
}


export default (sourceFile: ts.SourceFile, bindings: Bindings, isReactiveCall: (node: ts.Node) => boolean) => {
    let ctx: TransformContext = {
            bindings,
            isReactiveCall,
            replacements: [],
            scopedBindings: [],
            sourceFile,
            tmpCounter: 0
        };

    visit(ctx, sourceFile);

    return ctx.replacements;
};

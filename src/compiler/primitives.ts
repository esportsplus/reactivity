import { ts } from '@esportsplus/typescript';
import type { ReplacementIntent } from '@esportsplus/typescript/compiler';
import { COMPOUND_OPERATORS, NAMESPACE, TYPES } from './constants';
import type { Bindings } from './types';


interface ScopeBinding {
    depth: number;
    name: string;
    scope: ts.Node;
    type: TYPES;
}

interface TransformContext {
    bindings: Bindings;
    isReactiveCall: (node: ts.Node) => boolean;
    replacements: ReplacementIntent[];
    scopedBindings: ScopeBinding[];
    sourceFile: ts.SourceFile;
    tmpCounter: number;
}


function inScope(reference: ts.Node, binding: ScopeBinding): boolean {
    let current: ts.Node | undefined = reference;

    while (current) {
        if (current === binding.scope) {
            return true;
        }

        current = current.parent;
    }

    return false;
}

function isScope(node: ts.Node): boolean {
    return ts.isArrowFunction(node) ||
        ts.isBlock(node) ||
        ts.isCatchClause(node) ||
        ts.isForInStatement(node) ||
        ts.isForOfStatement(node) ||
        ts.isForStatement(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isSourceFile(node);
}

// Innermost enclosing scope plus its nesting depth, so shadowed names resolve to the closest binding
function scopeOf(node: ts.Node): { depth: number; scope: ts.Node } {
    let current: ts.Node | undefined = node.parent,
        depth = 0,
        scope: ts.Node = node.getSourceFile();

    while (current) {
        if (isScope(current)) {
            if (scope === node.getSourceFile() && !ts.isSourceFile(current)) {
                scope = current;
            }

            depth++;
        }

        current = current.parent;
    }

    return { depth, scope };
}

function visit(ctx: TransformContext, node: ts.Node): void {
    if (ctx.isReactiveCall(node)) {
        let call = node as ts.CallExpression;

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
                    ctx.replacements.push({
                        generate: () => `${NAMESPACE}.reactive`,
                        node: call.expression
                    });
                    node.forEachChild(n => visit(ctx, n));
                    return;
                }
            }

            if (classification) {
                let varname: string | null = null;

                if (call.parent && ts.isVariableDeclaration(call.parent) && ts.isIdentifier(call.parent.name)) {
                    varname = call.parent.name.text;
                }
                else if (
                    call.parent &&
                    ts.isBinaryExpression(call.parent) &&
                    call.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                    ts.isIdentifier(call.parent.left)
                ) {
                    varname = call.parent.left.text;
                }

                if (varname) {
                    let { depth, scope } = scopeOf(call);

                    ctx.bindings.set(varname, classification);
                    ctx.scopedBindings.push({ depth, name: varname, scope, type: classification });
                }

                // Replace just the 'reactive' identifier with the appropriate namespace function
                ctx.replacements.push({
                    generate: () => classification === TYPES.Computed
                        ? `${NAMESPACE}.computed`
                        : `${NAMESPACE}.signal`,
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
            node.forEachChild(n => visit(ctx, n));
            return;
        }

        let bindings = ctx.scopedBindings,
            binding,
            name = node.text;

        for (let i = 0, n = bindings.length; i < n; i++) {
            let b = bindings[i];

            if (b.name === name && (!binding || b.depth >= binding.depth) && inScope(node, b)) {
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
                    if (binding.type !== TYPES.Computed) {
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
                            let delta = (parent as ts.PostfixUnaryExpression | ts.PrefixUnaryExpression).operator === ts.SyntaxKind.PlusPlusToken ? '+ 1' : '- 1',
                                isPrefix = ts.isPrefixUnaryExpression(parent);

                            if (ts.isExpressionStatement(parent.parent)) {
                                ctx.replacements.push({
                                    generate: () => `${NAMESPACE}.write(${name}, ${name}.value ${delta})`,
                                    node: parent
                                });
                            }
                            else if (isPrefix) {
                                ctx.replacements.push({
                                    generate: () => `(${NAMESPACE}.write(${name}, ${name}.value ${delta}), ${name}.value)`,
                                    node: parent
                                });
                            }
                            else {
                                let tmp = `_t${ctx.tmpCounter++}`;

                                ctx.replacements.push({
                                    generate: () => `((${tmp}) => (${NAMESPACE}.write(${name}, ${tmp} ${delta}), ${tmp}))(${name}.value)`,
                                    node: parent
                                });
                            }
                        }
                    }
                }
                else {
                    ctx.replacements.push({
                        generate: () => `${NAMESPACE}.read(${name})`,
                        node
                    });
                }
            }
        }
    }

    node.forEachChild(n => visit(ctx, n));
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

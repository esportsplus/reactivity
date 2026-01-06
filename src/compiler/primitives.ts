import { ts } from '@esportsplus/typescript';
import { ast, code as c, imports, type Range, type Replacement } from '@esportsplus/typescript/compiler';
import { COMPILER_ENTRYPOINT, COMPILER_TYPES, PACKAGE } from '~/constants';
import type { AliasKey, Aliases, Bindings } from '~/types';


interface ArgContext {
    aliases: Aliases;
    argStart: number;
    innerReplacements: Replacement[];
    scopedBindings: ScopeBinding[];
    sourceFile: ts.SourceFile;
    used: Set<AliasKey>;
}

interface ScopeBinding {
    name: string;
    scope: ts.Node;
    type: COMPILER_TYPES;
}

interface TransformContext {
    aliases: Aliases;
    bindings: Bindings;
    checker?: ts.TypeChecker;
    computedArgRanges: Range[];
    replacements: Replacement[];
    scopedBindings: ScopeBinding[];
    sourceFile: ts.SourceFile;
    tmpCounter: number;
    used: Set<AliasKey>;
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
            ts.isBlock(current) ||
            ts.isSourceFile(current) ||
            ts.isFunctionDeclaration(current) ||
            ts.isFunctionExpression(current) ||
            ts.isArrowFunction(current) ||
            ts.isForStatement(current) ||
            ts.isForInStatement(current) ||
            ts.isForOfStatement(current)
        ) {
            return current;
        }

        current = current.parent;
    }

    return node.getSourceFile();
}

function isInDeclarationInit(node: ts.Node): boolean {
    let parent = node.parent;

    return ts.isVariableDeclaration(parent) && parent.initializer === node;
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

function isReactiveCall(node: ts.CallExpression, checker?: ts.TypeChecker): boolean {
    if (!ts.isIdentifier(node.expression)) {
        return false;
    }

    if (node.expression.text !== COMPILER_ENTRYPOINT) {
        return false;
    }

    return imports.isFromPackage(node.expression, PACKAGE, checker);
}

function isReactiveReassignment(node: ts.Node, checker?: ts.TypeChecker): boolean {
    let parent = node.parent;

    if (
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        parent.right === node &&
        ts.isCallExpression(node)
    ) {
        return isReactiveCall(node as ts.CallExpression, checker);
    }

    return false;
}

function isWriteContext(node: ts.Identifier): 'simple' | 'compound' | 'increment' | false {
    let parent = node.parent;

    if (ts.isBinaryExpression(parent) && parent.left === node) {
        let op = parent.operatorToken.kind;

        if (op === ts.SyntaxKind.EqualsToken) {
            return 'simple';
        }

        if (COMPOUND_OPERATORS.has(op)) {
            return 'compound';
        }
    }

    if (ts.isPostfixUnaryExpression(parent) || ts.isPrefixUnaryExpression(parent)) {
        let op = parent.operator;

        if (op === ts.SyntaxKind.PlusPlusToken || op === ts.SyntaxKind.MinusMinusToken) {
            return 'increment';
        }
    }

    return false;
}

function visit(ctx: TransformContext, node: ts.Node): void {
    if (
        ts.isCallExpression(node) &&
        node.arguments.length > 0 &&
        isReactiveCall(node, ctx.checker)
    ) {
        let arg = node.arguments[0],
            classification: COMPILER_TYPES | null = COMPILER_TYPES.Signal;

        if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
            classification = COMPILER_TYPES.Computed;
        }
        else if (ts.isObjectLiteralExpression(arg) || ts.isArrayLiteralExpression(arg)) {
            classification = null;
        }

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

                ctx.scopedBindings.push({ name: varName, scope, type: classification });
                ctx.bindings.set(varName, classification);
            }

            if (classification === COMPILER_TYPES.Computed) {
                let argStart = arg.getStart(ctx.sourceFile);

                ctx.computedArgRanges.push({ end: arg.end, start: argStart });

                let argCtx: ArgContext = {
                    aliases: ctx.aliases,
                    argStart,
                    innerReplacements: [],
                    scopedBindings: ctx.scopedBindings,
                    sourceFile: ctx.sourceFile,
                    used: ctx.used
                };

                visitArg(argCtx, arg);

                let argText = c.replace(arg.getText(ctx.sourceFile), argCtx.innerReplacements);

                ctx.used.add('computed');
                ctx.replacements.push({
                    end: node.end,
                    newText: `${ctx.aliases.computed}(${argText})`,
                    start: node.pos
                });
            }
            else {
                ctx.used.add('signal');
                ctx.replacements.push({
                    end: node.end,
                    newText: `${ctx.aliases.signal}(${arg.getText(ctx.sourceFile)})`,
                    start: node.pos
                });
            }
        }
    }


    if (ts.isIdentifier(node) && node.parent && !isInDeclarationInit(node.parent)) {
        if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) {
            ts.forEachChild(node, n => visit(ctx, n));
            return;
        }

        let nodeStart = node.getStart(ctx.sourceFile);

        if (ast.inRange(ctx.computedArgRanges, nodeStart, node.end)) {
            ts.forEachChild(node, n => visit(ctx, n));
            return;
        }

        let binding = findBinding(ctx.scopedBindings, node.text, node),
            name = node.text;

        if (binding && node.parent) {
            if (
                !isReactiveReassignment(node.parent, ctx.checker) &&
                !(ts.isTypeOfExpression(node.parent) && node.parent.expression === node)
            ) {
                let writeCtx = isWriteContext(node);

                if (writeCtx) {
                    if (binding.type !== COMPILER_TYPES.Computed) {
                        let parent = node.parent;

                        if (writeCtx === 'simple' && ts.isBinaryExpression(parent)) {
                            ctx.used.add('write');
                            ctx.replacements.push({
                                end: parent.end,
                                newText: `${ctx.aliases.write}(${name}, ${parent.right.getText(ctx.sourceFile)})`,
                                start: parent.pos
                            });
                        }
                        else if (writeCtx === 'compound' && ts.isBinaryExpression(parent)) {
                            let op = COMPOUND_OPERATORS.get(parent.operatorToken.kind) ?? '+'

                            ctx.used.add('write');
                            ctx.replacements.push({
                                end: parent.end,
                                newText: `${ctx.aliases.write}(${name}, ${name}.value ${op} ${parent.right.getText(ctx.sourceFile)})`,
                                start: parent.pos
                            });
                        }
                        else if (writeCtx === 'increment') {
                            let delta = (parent as ts.PrefixUnaryExpression | ts.PostfixUnaryExpression).operator === ts.SyntaxKind.PlusPlusToken ? '+ 1' : '- 1',
                                isPrefix = ts.isPrefixUnaryExpression(parent);

                            ctx.used.add('write');

                            if (ts.isExpressionStatement(parent.parent)) {
                                ctx.replacements.push({
                                    end: parent.end,
                                    newText: `${ctx.aliases.write}(${name}, ${name}.value ${delta})`,
                                    start: parent.pos
                                });
                            }
                            else if (isPrefix) {
                                ctx.replacements.push({
                                    end: parent.end,
                                    newText: `(${ctx.aliases.write}(${name}, ${name}.value ${delta}), ${name}.value)`,
                                    start: parent.pos
                                });
                            }
                            else {
                                let tmp = `_t${ctx.tmpCounter++}`;

                                ctx.replacements.push({
                                    end: parent.end,
                                    newText: `((${tmp}) => (${ctx.aliases.write}(${name}, ${tmp} ${delta}), ${tmp}))(${name}.value)`,
                                    start: parent.pos
                                });
                            }
                        }
                    }
                }
                else {
                    ctx.used.add('read');
                    ctx.replacements.push({
                        end: node.end,
                        newText: `${ctx.aliases.read}(${name})`,
                        start: node.pos
                    });
                }
            }
        }
    }

    ts.forEachChild(node, n => visit(ctx, n));
}


function visitArg(ctx: ArgContext, node: ts.Node): void {
    if (ts.isIdentifier(node) && node.parent) {
        if (
            (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) ||
            (ts.isCallExpression(node.parent) && node.parent.expression === node)
        ) {
            ts.forEachChild(node, n => visitArg(ctx, n));
            return;
        }

        if (findBinding(ctx.scopedBindings, node.text, node)) {
            ctx.used.add('read');
            ctx.innerReplacements.push({
                end: node.end - ctx.argStart,
                newText: `${ctx.aliases.read}(${node.text})`,
                start: node.getStart(ctx.sourceFile) - ctx.argStart
            });
        }
    }

    ts.forEachChild(node, n => visitArg(ctx, n));
}


export default (sourceFile: ts.SourceFile, bindings: Bindings, aliases: Aliases, used: Set<AliasKey>, checker?: ts.TypeChecker): string => {
    let code = sourceFile.getFullText(),
        ctx: TransformContext = {
            aliases,
            bindings,
            checker,
            computedArgRanges: [],
            replacements: [],
            scopedBindings: [],
            sourceFile,
            tmpCounter: 0,
            used
        };

    visit(ctx, sourceFile);

    if (ctx.replacements.length === 0) {
        return code;
    }

    return c.replace(code, ctx.replacements);
};


import { ts } from '@esportsplus/typescript';
import { code as c, type Range, type Replacement } from '@esportsplus/typescript/transformer';
import type { BindingType, Bindings } from '~/types';
import { COMPILER_TYPE_COMPUTED, COMPILER_ENTRYPOINT, COMPILER_TYPE_SIGNAL, PACKAGE } from '~/constants';


interface ArgContext {
    argStart: number;
    innerReplacements: Replacement[];
    ns: string;
    scopedBindings: ScopeBinding[];
    sourceFile: ts.SourceFile;
}

interface ScopeBinding {
    name: string;
    scope: ts.Node;
    type: BindingType;
}

interface TransformContext {
    bindings: Bindings;
    computedArgRanges: Range[];
    hasReactiveImport: boolean;
    ns: string;
    replacements: Replacement[];
    scopedBindings: ScopeBinding[];
    sourceFile: ts.SourceFile;
    tmpCounter: number;
}


let COMPOUND_OPERATORS = new Map<ts.SyntaxKind, string>([
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


function classifyReactiveArg(arg: ts.Expression): BindingType | null {
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
        return COMPILER_TYPE_COMPUTED;
    }

    if (ts.isObjectLiteralExpression(arg) || ts.isArrayLiteralExpression(arg)) {
        return null;
    }

    return COMPILER_TYPE_SIGNAL;
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

function isInComputedRange(ranges: Range[], start: number, end: number): boolean {
    for (let i = 0, n = ranges.length; i < n; i++) {
        let r = ranges[i];

        if (start >= r.start && end <= r.end) {
            return true;
        }
    }

    return false;
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

function isReactiveReassignment(node: ts.Node): boolean {
    let parent = node.parent;

    if (
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        parent.right === node &&
        ts.isCallExpression(node) &&
        ts.isIdentifier((node as ts.CallExpression).expression) &&
        ((node as ts.CallExpression).expression as ts.Identifier).text === COMPILER_ENTRYPOINT
    ) {
        return true;
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
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text.includes(PACKAGE)
    ) {
        let clause = node.importClause;

        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
            for (let i = 0, n = clause.namedBindings.elements.length; i < n; i++) {
                if (clause.namedBindings.elements[i].name.text === COMPILER_ENTRYPOINT) {
                    ctx.hasReactiveImport = true;
                    break;
                }
            }
        }
    }

    if (
        ctx.hasReactiveImport &&
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === COMPILER_ENTRYPOINT &&
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

                ctx.scopedBindings.push({ name: varName, scope, type: classification });
                ctx.bindings.set(varName, classification);
            }

            if (classification === COMPILER_TYPE_COMPUTED) {
                let argStart = arg.getStart(ctx.sourceFile);

                ctx.computedArgRanges.push({ end: arg.end, start: argStart });

                let argCtx: ArgContext = {
                    argStart,
                    innerReplacements: [],
                    ns: ctx.ns,
                    scopedBindings: ctx.scopedBindings,
                    sourceFile: ctx.sourceFile
                };

                visitArg(argCtx, arg);

                let argText = c.replace(arg.getText(ctx.sourceFile), argCtx.innerReplacements);

                ctx.replacements.push({
                    end: node.end,
                    newText: `${ctx.ns}.computed(${argText})`,
                    start: node.pos
                });
            }
            else {
                ctx.replacements.push({
                    end: node.end,
                    newText: `${ctx.ns}.signal(${arg.getText(ctx.sourceFile)})`,
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

        if (isInComputedRange(ctx.computedArgRanges, nodeStart, node.end)) {
            ts.forEachChild(node, n => visit(ctx, n));
            return;
        }

        let binding = findBinding(ctx.scopedBindings, node.text, node),
            name = node.text;

        if (binding && node.parent) {
            if (
                !isReactiveReassignment(node.parent) &&
                !(ts.isTypeOfExpression(node.parent) && node.parent.expression === node)
            ) {
                let writeCtx = isWriteContext(node);

                if (writeCtx) {
                    if (binding.type !== COMPILER_TYPE_COMPUTED) {
                        let parent = node.parent;

                        if (writeCtx === 'simple' && ts.isBinaryExpression(parent)) {
                            ctx.replacements.push({
                                end: parent.end,
                                newText: `${ctx.ns}.write(${name}, ${parent.right.getText(ctx.sourceFile)})`,
                                start: parent.pos
                            });
                        }
                        else if (writeCtx === 'compound' && ts.isBinaryExpression(parent)) {
                            let op = COMPOUND_OPERATORS.get(parent.operatorToken.kind) ?? '+';

                            ctx.replacements.push({
                                end: parent.end,
                                newText: `${ctx.ns}.write(${name}, ${name}.value ${op} ${parent.right.getText(ctx.sourceFile)})`,
                                start: parent.pos
                            });
                        }
                        else if (writeCtx === 'increment') {
                            let delta = (parent as ts.PrefixUnaryExpression | ts.PostfixUnaryExpression).operator === ts.SyntaxKind.PlusPlusToken ? '+ 1' : '- 1',
                                isPrefix = ts.isPrefixUnaryExpression(parent);

                            if (ts.isExpressionStatement(parent.parent)) {
                                ctx.replacements.push({
                                    end: parent.end,
                                    newText: `${ctx.ns}.write(${name}, ${name}.value ${delta})`,
                                    start: parent.pos
                                });
                            }
                            else if (isPrefix) {
                                ctx.replacements.push({
                                    end: parent.end,
                                    newText: `(${ctx.ns}.write(${name}, ${name}.value ${delta}), ${name}.value)`,
                                    start: parent.pos
                                });
                            }
                            else {
                                let tmp = `_t${ctx.tmpCounter++}`;

                                ctx.replacements.push({
                                    end: parent.end,
                                    newText: `((${tmp}) => (${ctx.ns}.write(${name}, ${tmp} ${delta}), ${tmp}))(${name}.value)`,
                                    start: parent.pos
                                });
                            }
                        }
                    }
                }
                else {
                    ctx.replacements.push({
                        end: node.end,
                        newText: `${ctx.ns}.read(${name})`,
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
            ctx.innerReplacements.push({
                end: node.end - ctx.argStart,
                newText: `${ctx.ns}.read(${node.text})`,
                start: node.getStart(ctx.sourceFile) - ctx.argStart
            });
        }
    }

    ts.forEachChild(node, n => visitArg(ctx, n));
}


export default (sourceFile: ts.SourceFile, bindings: Bindings, ns: string): string => {
    let code = sourceFile.getFullText(),
        ctx: TransformContext = {
            bindings,
            computedArgRanges: [],
            hasReactiveImport: false,
            ns,
            replacements: [],
            scopedBindings: [],
            sourceFile,
            tmpCounter: 0
        };

    visit(ctx, sourceFile);

    if (ctx.replacements.length === 0) {
        return code;
    }

    return c.replace(code, ctx.replacements);
};

import { uid, type Range } from '@esportsplus/typescript/transformer';
import type { BindingType, Bindings } from '~/types';
import { addMissingImports, applyReplacements, Replacement } from './utilities';
import { ts } from '@esportsplus/typescript';


interface ArgContext {
    argStart: number;
    innerReplacements: Replacement[];
    neededImports: Set<string>;
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
    neededImports: Set<string>;
    replacements: Replacement[];
    scopedBindings: ScopeBinding[];
    sourceFile: ts.SourceFile;
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

function getCompoundOperator(kind: ts.SyntaxKind): string {
    if (kind === ts.SyntaxKind.PlusEqualsToken) {
        return '+';
    }
    else if (kind === ts.SyntaxKind.MinusEqualsToken) {
        return '-';
    }
    else if (kind === ts.SyntaxKind.AsteriskEqualsToken) {
        return '*';
    }
    else if (kind === ts.SyntaxKind.SlashEqualsToken) {
        return '/';
    }
    else if (kind === ts.SyntaxKind.PercentEqualsToken) {
        return '%';
    }
    else if (kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken) {
        return '**';
    }
    else if (kind === ts.SyntaxKind.AmpersandEqualsToken) {
        return '&';
    }
    else if (kind === ts.SyntaxKind.BarEqualsToken) {
        return '|';
    }
    else if (kind === ts.SyntaxKind.CaretEqualsToken) {
        return '^';
    }
    else if (kind === ts.SyntaxKind.LessThanLessThanEqualsToken) {
        return '<<';
    }
    else if (kind === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken) {
        return '>>';
    }
    else if (kind === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken) {
        return '>>>';
    }
    else if (kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken) {
        return '&&';
    }
    else if (kind === ts.SyntaxKind.BarBarEqualsToken) {
        return '||';
    }
    else if (kind === ts.SyntaxKind.QuestionQuestionEqualsToken) {
        return '??';
    }
    else {
        return '+';
    }
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

function isReactiveReassignment(node: ts.Node): boolean {
    let parent = node.parent;

    if (
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        parent.right === node &&
        ts.isCallExpression(node) &&
        ts.isIdentifier((node as ts.CallExpression).expression) &&
        ((node as ts.CallExpression).expression as ts.Identifier).text === 'reactive'
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

        if (op >= ts.SyntaxKind.PlusEqualsToken && op <= ts.SyntaxKind.CaretEqualsToken) {
            return 'compound';
        }

        if (
            op === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
            op === ts.SyntaxKind.BarBarEqualsToken ||
            op === ts.SyntaxKind.QuestionQuestionEqualsToken
        ) {
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

                ctx.scopedBindings.push({ name: varName, scope, type: classification });
                ctx.bindings.set(varName, classification);
            }

            if (classification === 'computed') {
                ctx.computedArgRanges.push({
                    end: arg.end,
                    start: arg.getStart(ctx.sourceFile)
                });

                let argCtx: ArgContext = {
                    argStart: arg.getStart(ctx.sourceFile),
                    innerReplacements: [],
                    neededImports: ctx.neededImports,
                    scopedBindings: ctx.scopedBindings,
                    sourceFile: ctx.sourceFile
                };

                visitArg(argCtx, arg);

                let argText = applyReplacements(arg.getText(ctx.sourceFile), argCtx.innerReplacements);

                ctx.replacements.push({
                    end: node.end,
                    newText: `computed(${argText})`,
                    start: node.pos
                });

                ctx.neededImports.add('computed');
            }
            else {
                let argText = arg.getText(ctx.sourceFile);

                ctx.replacements.push({
                    end: node.end,
                    newText: `signal(${argText})`,
                    start: node.pos
                });

                ctx.neededImports.add('signal');
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
                    if (binding.type !== 'computed') {
                        ctx.neededImports.add('set');

                        let parent = node.parent;

                        if (writeCtx === 'simple' && ts.isBinaryExpression(parent)) {
                            let valueText = parent.right.getText(ctx.sourceFile);

                            ctx.replacements.push({
                                end: parent.end,
                                newText: `set(${name}, ${valueText})`,
                                start: parent.pos
                            });
                        }
                        else if (writeCtx === 'compound' && ts.isBinaryExpression(parent)) {
                            let op = getCompoundOperator(parent.operatorToken.kind),
                                valueText = parent.right.getText(ctx.sourceFile);

                            ctx.replacements.push({
                                end: parent.end,
                                newText: `set(${name}, ${name}.value ${op} ${valueText})`,
                                start: parent.pos
                            });
                        }
                        else if (writeCtx === 'increment') {
                            let isPrefix = ts.isPrefixUnaryExpression(parent),
                                op = (parent as ts.PrefixUnaryExpression | ts.PostfixUnaryExpression).operator,
                                delta = op === ts.SyntaxKind.PlusPlusToken ? '+ 1' : '- 1';

                            if (ts.isExpressionStatement(parent.parent)) {
                                ctx.replacements.push({
                                    end: parent.end,
                                    newText: `set(${name}, ${name}.value ${delta})`,
                                    start: parent.pos
                                });
                            }
                            else if (isPrefix) {
                                ctx.replacements.push({
                                    end: parent.end,
                                    newText: `(set(${name}, ${name}.value ${delta}), ${name}.value)`,
                                    start: parent.pos
                                });
                            }
                            else {
                                let tmp = uid('tmp');

                                ctx.replacements.push({
                                    end: parent.end,
                                    newText: `((${tmp}) => (set(${name}, ${tmp} ${delta}), ${tmp}))(${name}.value)`,
                                    start: parent.pos
                                });
                            }
                        }
                    }
                }
                else {
                    ctx.neededImports.add('read');

                    ctx.replacements.push({
                        end: node.end,
                        newText: `read(${name})`,
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
        if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) {
            ts.forEachChild(node, n => visitArg(ctx, n));
            return;
        }

        if (ts.isCallExpression(node.parent) && node.parent.expression === node) {
            ts.forEachChild(node, n => visitArg(ctx, n));
            return;
        }

        let binding = findBinding(ctx.scopedBindings, node.text, node);

        if (binding) {
            ctx.neededImports.add('read');

            ctx.innerReplacements.push({
                end: node.end - ctx.argStart,
                newText: `read(${node.text})`,
                start: node.getStart(ctx.sourceFile) - ctx.argStart
            });
        }
    }

    ts.forEachChild(node, n => visitArg(ctx, n));
}


const transformReactivePrimitives = (
    sourceFile: ts.SourceFile,
    bindings: Bindings
): string => {
    let code = sourceFile.getFullText(),
        ctx: TransformContext = {
            bindings,
            computedArgRanges: [],
            hasReactiveImport: false,
            neededImports: new Set<string>(),
            replacements: [],
            scopedBindings: [],
            sourceFile
        };

    visit(ctx, sourceFile);

    if (ctx.replacements.length === 0) {
        return code;
    }

    let result = applyReplacements(code, ctx.replacements);

    if (ctx.neededImports.size > 0) {
        result = addMissingImports(result, ctx.neededImports);
    }

    return result;
};


export { transformReactivePrimitives };

import ts from 'typescript';
import type { BindingType, Bindings } from '~/types';
import { addMissingImports, applyReplacements, Replacement } from './utils';


interface ComputedArgRange {
    end: number;
    start: number;
}

interface ScopeBinding {
    name: string;
    scope: ts.Node;
    type: BindingType;
}


function findEnclosingScope(node: ts.Node): ts.Node {
    let current = node.parent;

    while (current) {
        if (ts.isBlock(current) ||
            ts.isSourceFile(current) ||
            ts.isFunctionDeclaration(current) ||
            ts.isFunctionExpression(current) ||
            ts.isArrowFunction(current) ||
            ts.isForStatement(current) ||
            ts.isForInStatement(current) ||
            ts.isForOfStatement(current)) {
            return current;
        }

        current = current.parent;
    }

    return node.getSourceFile();
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

function classifyReactiveArg(arg: ts.Expression): 'computed' | 'signal' | null {
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
        return 'computed';
    }

    if (ts.isObjectLiteralExpression(arg) || ts.isArrayLiteralExpression(arg)) {
        return null;
    }

    return 'signal';
}

function isInDeclarationInit(node: ts.Node): boolean {
    let parent = node.parent;

    if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
        return true;
    }

    return false;
}

function isReactiveReassignment(node: ts.Node): boolean {
    let parent = node.parent;

    if (ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        parent.right === node &&
        ts.isCallExpression(node) &&
        ts.isIdentifier((node as ts.CallExpression).expression) &&
        ((node as ts.CallExpression).expression as ts.Identifier).text === 'reactive') {
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

        if (op === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
            op === ts.SyntaxKind.BarBarEqualsToken ||
            op === ts.SyntaxKind.QuestionQuestionEqualsToken) {
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

function getCompoundOperator(kind: ts.SyntaxKind): string {
    switch (kind) {
        case ts.SyntaxKind.PlusEqualsToken: return '+';
        case ts.SyntaxKind.MinusEqualsToken: return '-';
        case ts.SyntaxKind.AsteriskEqualsToken: return '*';
        case ts.SyntaxKind.SlashEqualsToken: return '/';
        case ts.SyntaxKind.PercentEqualsToken: return '%';
        case ts.SyntaxKind.AsteriskAsteriskEqualsToken: return '**';
        case ts.SyntaxKind.AmpersandEqualsToken: return '&';
        case ts.SyntaxKind.BarEqualsToken: return '|';
        case ts.SyntaxKind.CaretEqualsToken: return '^';
        case ts.SyntaxKind.LessThanLessThanEqualsToken: return '<<';
        case ts.SyntaxKind.GreaterThanGreaterThanEqualsToken: return '>>';
        case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken: return '>>>';
        case ts.SyntaxKind.AmpersandAmpersandEqualsToken: return '&&';
        case ts.SyntaxKind.BarBarEqualsToken: return '||';
        case ts.SyntaxKind.QuestionQuestionEqualsToken: return '??';
        default: return '+';
    }
}

function transformComputedArg(
    arg: ts.Expression,
    scopedBindings: ScopeBinding[],
    sourceFile: ts.SourceFile,
    neededImports: Set<string>
): string {
    let argStart = arg.getStart(sourceFile),
        innerReplacements: Replacement[] = [],
        text = arg.getText(sourceFile);

    function visitArg(node: ts.Node): void {
        // Only transform identifiers that are signal bindings
        if (ts.isIdentifier(node)) {
            // Skip if it's a property name in property access (obj.prop - skip prop)
            if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) {
                ts.forEachChild(node, visitArg);
                return;
            }

            // Skip if it's the function name in a call expression
            if (ts.isCallExpression(node.parent) && node.parent.expression === node) {
                ts.forEachChild(node, visitArg);
                return;
            }

            let binding = scopedBindings.find(b => b.name === node.text && isInScope(node, b));

            if (binding) {
                neededImports.add('read');

                innerReplacements.push({
                    end: node.end - argStart,
                    newText: `read(${node.text})`,
                    start: node.getStart(sourceFile) - argStart
                });
            }
        }

        ts.forEachChild(node, visitArg);
    }

    visitArg(arg);

    return applyReplacements(text, innerReplacements);
}


const transformReactivePrimitives = (
    sourceFile: ts.SourceFile,
    bindings: Bindings
): string => {
    let code = sourceFile.getFullText(),
        computedArgRanges: ComputedArgRange[] = [],
        hasReactiveImport = false,
        neededImports = new Set<string>(),
        replacements: Replacement[] = [],
        scopedBindings: ScopeBinding[] = [];

    // Single-pass visitor: detect imports, bindings, and usages together
    function visit(node: ts.Node): void {
        // Detect reactive import
        if (ts.isImportDeclaration(node) &&
            ts.isStringLiteral(node.moduleSpecifier) &&
            node.moduleSpecifier.text.includes('@esportsplus/reactivity')) {
            let clause = node.importClause;

            if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
                for (let i = 0, n = clause.namedBindings.elements.length; i < n; i++) {
                    if (clause.namedBindings.elements[i].name.text === 'reactive') {
                        hasReactiveImport = true;
                        break;
                    }
                }
            }
        }

        // Detect reactive() calls and transform declarations
        if (hasReactiveImport &&
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'reactive' &&
            node.arguments.length > 0) {

            let arg = node.arguments[0],
                classification = classifyReactiveArg(arg);

            if (classification) {
                let varName: string | null = null;

                if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
                    varName = node.parent.name.text;
                }
                else if (ts.isBinaryExpression(node.parent) &&
                         node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                         ts.isIdentifier(node.parent.left)) {
                    varName = node.parent.left.text;
                }

                if (varName) {
                    let scope = findEnclosingScope(node);

                    scopedBindings.push({ name: varName, scope, type: classification });
                    bindings.set(varName, classification);
                }

                if (classification === 'computed') {
                    // Track range to skip identifiers inside when visitor continues
                    computedArgRanges.push({
                        end: arg.end,
                        start: arg.getStart(sourceFile)
                    });

                    // Transform signal references inside the computed arg
                    let argText = transformComputedArg(arg, scopedBindings, sourceFile, neededImports);

                    replacements.push({
                        end: node.end,
                        newText: `computed(${argText})`,
                        start: node.pos
                    });

                    neededImports.add('computed');
                }
                else {
                    let argText = arg.getText(sourceFile);

                    replacements.push({
                        end: node.end,
                        newText: `signal(${argText})`,
                        start: node.pos
                    });

                    neededImports.add('signal');
                }
            }
        }

        // Transform identifier usages
        if (ts.isIdentifier(node) && !isInDeclarationInit(node.parent)) {
            // Skip if it's a property name in property access (obj.prop - skip prop)
            if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) {
                ts.forEachChild(node, visit);
                return;
            }

            let nodeStart = node.getStart(sourceFile);

            // Skip if inside a computed arg we already transformed
            let insideComputedArg = computedArgRanges.some(
                r => nodeStart >= r.start && node.end <= r.end
            );

            if (insideComputedArg) {
                ts.forEachChild(node, visit);
                return;
            }

            let name = node.text,
                binding = scopedBindings.find(b => b.name === name && isInScope(node, b));

            if (binding) {
                // Skip reactive() reassignment
                if (!isReactiveReassignment(node.parent) &&
                    !(ts.isTypeOfExpression(node.parent) && node.parent.expression === node)) {

                    let writeCtx = isWriteContext(node);

                    if (writeCtx) {
                        if (binding.type !== 'computed') {
                            neededImports.add('set');

                            let parent = node.parent;

                            if (writeCtx === 'simple' && ts.isBinaryExpression(parent)) {
                                let valueText = parent.right.getText(sourceFile);

                                replacements.push({
                                    end: parent.end,
                                    newText: `set(${name}, ${valueText})`,
                                    start: parent.pos
                                });
                            }
                            else if (writeCtx === 'compound' && ts.isBinaryExpression(parent)) {
                                let op = getCompoundOperator(parent.operatorToken.kind),
                                    valueText = parent.right.getText(sourceFile);

                                replacements.push({
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
                                    replacements.push({
                                        end: parent.end,
                                        newText: `set(${name}, ${name}.value ${delta})`,
                                        start: parent.pos
                                    });
                                }
                                else if (isPrefix) {
                                    replacements.push({
                                        end: parent.end,
                                        newText: `(set(${name}, ${name}.value ${delta}), ${name}.value)`,
                                        start: parent.pos
                                    });
                                }
                                else {
                                    replacements.push({
                                        end: parent.end,
                                        newText: `((_v) => (set(${name}, _v ${delta}), _v))(${name}.value)`,
                                        start: parent.pos
                                    });
                                }
                            }
                        }
                    }
                    else {
                        neededImports.add('read');

                        replacements.push({
                            end: node.end,
                            newText: `read(${name})`,
                            start: node.pos
                        });
                    }
                }
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    if (replacements.length === 0) {
        return code;
    }

    let result = applyReplacements(code, replacements);

    if (neededImports.size > 0) {
        result = addMissingImports(result, neededImports);
    }

    return result;
};


export { transformReactivePrimitives };

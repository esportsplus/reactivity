import { uid } from '@esportsplus/typescript/transformer';
import { applyReplacements, Replacement } from './utilities';
import ts from 'typescript';


const TRAILING_SEMICOLON = /;$/;


interface Disposable {
    name: string;
    type: 'effect' | 'reactive';
}

interface FunctionEdit {
    cleanupBodyEnd: number;
    cleanupBodyStart: number;
    disposeCode: string;
    effectsToCapture: { end: number; name: string; start: number }[];
}

interface VisitResult {
    disposables: Disposable[];
    effectsToCapture: { end: number; name: string; start: number }[];
    returnStatement: ts.ReturnStatement | null;
}


function visitFunctionBody(
    body: ts.Block,
    parentBody: ts.Node
): VisitResult {
    let disposables: Disposable[] = [],
        effectsToCapture: { end: number; name: string; start: number }[] = [],
        returnStatement: ts.ReturnStatement | null = null;

    function visit(n: ts.Node): void {
        if (
            ts.isVariableDeclaration(n) &&
            ts.isIdentifier(n.name) &&
            n.initializer &&
            ts.isCallExpression(n.initializer) &&
            ts.isIdentifier(n.initializer.expression) &&
            n.initializer.expression.text === 'reactive'
        ) {
            disposables.push({ name: n.name.text, type: 'reactive' });
        }

        if (
            ts.isCallExpression(n) &&
            ts.isIdentifier(n.expression) &&
            n.expression.text === 'effect'
        ) {
            if (ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name)) {
                disposables.push({ name: n.parent.name.text, type: 'effect' });
            }
            else if (ts.isExpressionStatement(n.parent)) {
                let name = uid('effect');

                effectsToCapture.push({
                    end: n.parent.end,
                    name,
                    start: n.parent.pos
                });

                disposables.push({ name, type: 'effect' });
            }
        }

        if (
            ts.isReturnStatement(n) &&
            n.expression &&
            (ts.isArrowFunction(n.expression) || ts.isFunctionExpression(n.expression)) &&
            n.parent === parentBody
        ) {
            returnStatement = n;
        }

        ts.forEachChild(n, visit);
    }

    visit(body);

    return { disposables, effectsToCapture, returnStatement };
}

function processFunction(
    node: ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression,
    sourceFile: ts.SourceFile,
    edits: FunctionEdit[]
): void {
    if (!node.body || !ts.isBlock(node.body)) {
        return;
    }

    let result = visitFunctionBody(node.body, node.body),
        disposables = result.disposables,
        effectsToCapture = result.effectsToCapture,
        returnStatement = result.returnStatement;

    if (disposables.length === 0 || !returnStatement || !returnStatement.expression) {
        return;
    }

    let cleanupFn = returnStatement.expression as ts.ArrowFunction | ts.FunctionExpression;

    if (!cleanupFn.body) {
        return;
    }

    let disposeStatements: string[] = [];

    for (let i = disposables.length - 1; i >= 0; i--) {
        let d = disposables[i];

        if (d.type === 'reactive') {
            disposeStatements.push(`${d.name}.dispose();`);
        }
        else {
            disposeStatements.push(`${d.name}();`);
        }
    }

    let disposeCode = disposeStatements.join('\n');

    if (ts.isBlock(cleanupFn.body)) {
        edits.push({
            cleanupBodyEnd: cleanupFn.body.statements[0]?.pos ?? cleanupFn.body.end - 1,
            cleanupBodyStart: cleanupFn.body.pos + 1,
            disposeCode,
            effectsToCapture
        });
    }
    else {
        edits.push({
            cleanupBodyEnd: cleanupFn.body.end,
            cleanupBodyStart: cleanupFn.body.pos,
            disposeCode: `{ ${disposeCode}\n return ${cleanupFn.body.getText(sourceFile)}; }`,
            effectsToCapture
        });
    }
}


const injectAutoDispose = (sourceFile: ts.SourceFile): string => {
    let code = sourceFile.getFullText(),
        edits: FunctionEdit[] = [];

    function visit(node: ts.Node): void {
        if (
            ts.isFunctionDeclaration(node) ||
            ts.isFunctionExpression(node) ||
            ts.isArrowFunction(node)
        ) {
            processFunction(node, sourceFile, edits);
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    if (edits.length === 0) {
        return code;
    }

    let replacements: Replacement[] = [];

    for (let i = 0, n = edits.length; i < n; i++) {
        let edit = edits[i],
            effects = edit.effectsToCapture;

        for (let j = 0, m = effects.length; j < m; j++) {
            let effect = effects[j],
                original = code.substring(effect.start, effect.end).trim();

            replacements.push({
                end: effect.end,
                newText: `const ${effect.name} = ${original.replace(TRAILING_SEMICOLON, '')}`,
                start: effect.start
            });
        }

        replacements.push({
            end: edit.cleanupBodyEnd,
            newText: `\n${edit.disposeCode}`,
            start: edit.cleanupBodyStart
        });
    }

    return applyReplacements(code, replacements);
};


export { injectAutoDispose };

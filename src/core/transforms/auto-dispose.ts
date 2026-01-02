import ts from 'typescript';


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

interface Replacement {
    end: number;
    newText: string;
    start: number;
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
        effectCounter = 0,
        effectsToCapture: { end: number; name: string; start: number }[] = [],
        returnStatement: ts.ReturnStatement | null = null;

    function visit(n: ts.Node): void {
        if (ts.isVariableDeclaration(n) &&
            ts.isIdentifier(n.name) &&
            n.initializer &&
            ts.isCallExpression(n.initializer) &&
            ts.isIdentifier(n.initializer.expression) &&
            n.initializer.expression.text === 'reactive') {

            disposables.push({ name: n.name.text, type: 'reactive' });
        }

        if (ts.isCallExpression(n) &&
            ts.isIdentifier(n.expression) &&
            n.expression.text === 'effect') {

            if (ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name)) {
                disposables.push({ name: n.parent.name.text, type: 'effect' });
            }
            else if (ts.isExpressionStatement(n.parent)) {
                let effectName = `__effect${++effectCounter}`;

                effectsToCapture.push({
                    end: n.parent.end,
                    name: effectName,
                    start: n.parent.pos
                });

                disposables.push({ name: effectName, type: 'effect' });
            }
        }

        if (ts.isReturnStatement(n) &&
            n.expression &&
            (ts.isArrowFunction(n.expression) || ts.isFunctionExpression(n.expression))) {

            if (n.parent === parentBody) {
                returnStatement = n;
            }
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

    let { disposables, effectsToCapture, returnStatement } = visitFunctionBody(node.body, node.body);

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

    let disposeCode = disposeStatements.join('\n        ');

    if (ts.isBlock(cleanupFn.body)) {
        edits.push({
            cleanupBodyEnd: cleanupFn.body.statements[0]?.pos ?? cleanupFn.body.end - 1,
            cleanupBodyStart: cleanupFn.body.pos + 1,
            disposeCode,
            effectsToCapture
        });
    }
    else {
        let exprText = cleanupFn.body.getText(sourceFile);

        edits.push({
            cleanupBodyEnd: cleanupFn.body.end,
            cleanupBodyStart: cleanupFn.body.pos,
            disposeCode: `{ ${disposeCode}\n        return ${exprText}; }`,
            effectsToCapture
        });
    }
}


const injectAutoDispose = (
    sourceFile: ts.SourceFile
): string => {
    let code = sourceFile.getFullText(),
        edits: FunctionEdit[] = [];

    function visit(node: ts.Node): void {
        if (ts.isFunctionDeclaration(node) ||
            ts.isFunctionExpression(node) ||
            ts.isArrowFunction(node)) {
            processFunction(node, sourceFile, edits);
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    if (edits.length === 0) {
        return code;
    }

    let replacements: Replacement[] = [];

    for (let edit of edits) {
        for (let effect of edit.effectsToCapture) {
            let original = code.substring(effect.start, effect.end).trim();

            replacements.push({
                end: effect.end,
                newText: `const ${effect.name} = ${original.replace(/;$/, '')}`,
                start: effect.start
            });
        }

        replacements.push({
            end: edit.cleanupBodyEnd,
            newText: `\n        ${edit.disposeCode}`,
            start: edit.cleanupBodyStart
        });
    }

    replacements.sort((a, b) => b.start - a.start);

    let result = code;

    for (let r of replacements) {
        result = result.substring(0, r.start) + r.newText + result.substring(r.end);
    }

    return result;
};


export { injectAutoDispose };

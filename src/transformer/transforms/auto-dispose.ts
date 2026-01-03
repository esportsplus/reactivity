import { uid, TRAILING_SEMICOLON } from '@esportsplus/typescript/transformer';
import { applyReplacements, Replacement } from './utilities';
import ts from 'typescript';


interface BodyContext {
    disposables: Disposable[];
    effectsToCapture: { end: number; name: string; start: number }[];
    parentBody: ts.Node;
    returnStatement: ts.ReturnStatement | null;
}

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

interface MainContext {
    edits: FunctionEdit[];
    sourceFile: ts.SourceFile;
}


function processFunction(
    node: ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression,
    sourceFile: ts.SourceFile,
    edits: FunctionEdit[]
): void {
    if (!node.body || !ts.isBlock(node.body)) {
        return;
    }

    let ctx: BodyContext = {
            disposables: [],
            effectsToCapture: [],
            parentBody: node.body,
            returnStatement: null
        };

    visitBody(ctx, node.body);

    if (ctx.disposables.length === 0 || !ctx.returnStatement || !ctx.returnStatement.expression) {
        return;
    }

    let cleanupFn = ctx.returnStatement.expression as ts.ArrowFunction | ts.FunctionExpression;

    if (!cleanupFn.body) {
        return;
    }

    let disposeStatements: string[] = [];

    for (let i = ctx.disposables.length - 1; i >= 0; i--) {
        let d = ctx.disposables[i];

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
            effectsToCapture: ctx.effectsToCapture
        });
    }
    else {
        edits.push({
            cleanupBodyEnd: cleanupFn.body.end,
            cleanupBodyStart: cleanupFn.body.pos,
            disposeCode: `{ ${disposeCode}\n return ${cleanupFn.body.getText(sourceFile)}; }`,
            effectsToCapture: ctx.effectsToCapture
        });
    }
}

function visitBody(ctx: BodyContext, node: ts.Node): void {
    if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isIdentifier(node.initializer.expression) &&
        node.initializer.expression.text === 'reactive'
    ) {
        ctx.disposables.push({ name: node.name.text, type: 'reactive' });
    }

    if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'effect'
    ) {
        if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
            ctx.disposables.push({ name: node.parent.name.text, type: 'effect' });
        }
        else if (ts.isExpressionStatement(node.parent)) {
            let name = uid('effect');

            ctx.effectsToCapture.push({
                end: node.parent.end,
                name,
                start: node.parent.pos
            });

            ctx.disposables.push({ name, type: 'effect' });
        }
    }

    if (
        ts.isReturnStatement(node) &&
        node.expression &&
        (ts.isArrowFunction(node.expression) || ts.isFunctionExpression(node.expression)) &&
        node.parent === ctx.parentBody
    ) {
        ctx.returnStatement = node;
    }

    ts.forEachChild(node, n => visitBody(ctx, n));
}

function visitMain(ctx: MainContext, node: ts.Node): void {
    if (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node)
    ) {
        processFunction(node, ctx.sourceFile, ctx.edits);
    }

    ts.forEachChild(node, n => visitMain(ctx, n));
}


const injectAutoDispose = (sourceFile: ts.SourceFile): string => {
    let code = sourceFile.getFullText(),
        ctx: MainContext = {
            edits: [],
            sourceFile
        };

    visitMain(ctx, sourceFile);

    if (ctx.edits.length === 0) {
        return code;
    }

    let replacements: Replacement[] = [];

    for (let i = 0, n = ctx.edits.length; i < n; i++) {
        let edit = ctx.edits[i],
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

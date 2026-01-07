import type { PluginContext } from '@esportsplus/typescript/compiler';
import { ts } from '@esportsplus/typescript';
import { ast, imports } from '@esportsplus/typescript/compiler';
import { COMPILER_ENTRYPOINT, COMPILER_NAMESPACE, PACKAGE } from '~/constants';
import type { Bindings, TransformResult } from '~/types';
import array from './array';
import object from './object';


type AnalyzedFile = {
    hasReactiveImport: boolean;
};


const CONTEXT_KEY = 'reactivity:analyzed';


let transforms = [object, array];


function getAnalyzedFile(context: PluginContext | undefined, filename: string): AnalyzedFile | undefined {
    return (context?.get(CONTEXT_KEY) as Map<string, AnalyzedFile> | undefined)?.get(filename);
}

function hasReactiveImport(sourceFile: ts.SourceFile): boolean {
    return imports.find(sourceFile, PACKAGE).some(i => i.specifiers.has(COMPILER_ENTRYPOINT));
}

function isReactiveCallNode(node: ts.Node): boolean {
    return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === COMPILER_ENTRYPOINT;
}


const analyze = (sourceFile: ts.SourceFile, _program: ts.Program, context: PluginContext): void => {
    if (!hasReactiveImport(sourceFile)) {
        return;
    }

    let files = context.get(CONTEXT_KEY) as Map<string, AnalyzedFile> | undefined;

    if (!files) {
        files = new Map();
        context.set(CONTEXT_KEY, files);
    }

    files.set(sourceFile.fileName, {
        hasReactiveImport: true
    });
};

const isReactiveCall = (node: ts.CallExpression, _checker?: ts.TypeChecker): boolean => {
    if (!ts.isIdentifier(node.expression)) {
        return false;
    }

    return node.expression.text === COMPILER_ENTRYPOINT;
};

const transform = (sourceFile: ts.SourceFile, program: ts.Program, context?: PluginContext): TransformResult => {
    let bindings: Bindings = new Map(),
        changed = false,
        checker = program.getTypeChecker(),
        code = sourceFile.getFullText(),
        current = sourceFile,
        filename = sourceFile.fileName,
        result: string;

    // Try to get pre-analyzed data from context
    let analyzed = getAnalyzedFile(context, filename);

    // Fall back to inline check (for Vite or when context unavailable)
    if (!analyzed) {
        if (!hasReactiveImport(sourceFile)) {
            return { changed: false, code, sourceFile };
        }
    }
    else if (!analyzed.hasReactiveImport) {
        return { changed: false, code, sourceFile };
    }

    for (let i = 0, n = transforms.length; i < n; i++) {
        result = transforms[i](current, bindings, checker);

        if (result !== code) {
            code = result;
            changed = true;
            current = ts.createSourceFile(sourceFile.fileName, result, sourceFile.languageVersion, true);
        }
    }

    if (changed) {
        let remove: string[] = [];

        if (!ast.hasMatch(current, isReactiveCallNode)) {
            remove.push(COMPILER_ENTRYPOINT);
        }

        code = imports.modify(code, current, PACKAGE, { namespace: COMPILER_NAMESPACE, remove });
        sourceFile = ts.createSourceFile(sourceFile.fileName, code, sourceFile.languageVersion, true);
    }

    return { changed, code, sourceFile };
};


export { analyze, isReactiveCall, transform };

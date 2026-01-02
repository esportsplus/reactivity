import ts from 'typescript';
import type { Bindings, TransformOptions, TransformResult } from '~/types';
import { mightNeedTransform } from './detector';
import { injectAutoDispose } from './transforms/auto-dispose';
import { transformReactiveArrays } from './transforms/reactive-array';
import { transformReactiveObjects } from './transforms/reactive-object';
import { transformReactivePrimitives } from './transforms/reactive-primitives';


const transform = (
    sourceFile: ts.SourceFile,
    options?: TransformOptions
): TransformResult => {
    let bindings: Bindings = new Map(),
        code = sourceFile.getFullText(),
        current = sourceFile,
        original = code,
        result: string;

    if (!mightNeedTransform(code)) {
        return { code, sourceFile, transformed: false };
    }

    // Run all transforms, only re-parse between transforms if code changed
    result = transformReactiveObjects(current, bindings);

    if (result !== code) {
        current = ts.createSourceFile(sourceFile.fileName, result, sourceFile.languageVersion, true);
        code = result;
    }

    result = transformReactiveArrays(current, bindings);

    if (result !== code) {
        current = ts.createSourceFile(sourceFile.fileName, result, sourceFile.languageVersion, true);
        code = result;
    }

    result = transformReactivePrimitives(current, bindings);

    if (result !== code) {
        current = ts.createSourceFile(sourceFile.fileName, result, sourceFile.languageVersion, true);
        code = result;
    }

    if (options?.autoDispose) {
        result = injectAutoDispose(current);

        if (result !== code) {
            current = ts.createSourceFile(sourceFile.fileName, result, sourceFile.languageVersion, true);
            code = result;
        }
    }

    if (code === original) {
        return { code, sourceFile, transformed: false };
    }

    return {
        code,
        sourceFile: current,
        transformed: true
    };
};

function createTransformer(
    options?: TransformOptions
): ts.TransformerFactory<ts.SourceFile> {
    return () => {
        return (sourceFile: ts.SourceFile): ts.SourceFile => {
            let result = transform(sourceFile, options);

            return result.transformed ? result.sourceFile : sourceFile;
        };
    };
}


export { createTransformer, mightNeedTransform, transform };
export { injectAutoDispose } from './transforms/auto-dispose';
export { transformReactiveArrays } from './transforms/reactive-array';
export { transformReactiveObjects } from './transforms/reactive-object';
export { transformReactivePrimitives } from './transforms/reactive-primitives';

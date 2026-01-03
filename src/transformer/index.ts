import type { Bindings, TransformResult } from '~/types';
import { mightNeedTransform } from './detector';
import { transformReactiveArrays } from './transforms/reactive-array';
import { transformReactiveObjects } from './transforms/reactive-object';
import { transformReactivePrimitives } from './transforms/reactive-primitives';
import ts from 'typescript';


const createTransformer = (): ts.TransformerFactory<ts.SourceFile> => {
    return () => {
        return (sourceFile: ts.SourceFile): ts.SourceFile => {
            let result = transform(sourceFile);

            return result.transformed ? result.sourceFile : sourceFile;
        };
    };
};

const transform = (sourceFile: ts.SourceFile): TransformResult => {
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

    if (code === original) {
        return { code, sourceFile, transformed: false };
    }

    return {
        code,
        sourceFile: current,
        transformed: true
    };
};


export { createTransformer, mightNeedTransform, transform };
export { transformReactiveArrays } from './transforms/reactive-array';
export { transformReactiveObjects } from './transforms/reactive-object';
export { transformReactivePrimitives } from './transforms/reactive-primitives';

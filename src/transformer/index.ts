import { uid } from '@esportsplus/typescript/transformer';
import type { Bindings, TransformResult } from '~/types';
import { mightNeedTransform } from './detector';
import { transformReactiveArrays } from './transforms/array';
import { transformReactiveObjects } from './transforms/object';
import { transformReactivePrimitives } from './transforms/primitives';
import { ts } from '@esportsplus/typescript';


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
        ns = uid('r'),
        original = code,
        result: string;

    if (!mightNeedTransform(code)) {
        return { code, sourceFile, transformed: false };
    }

    result = transformReactiveObjects(current, bindings, ns);

    if (result !== code) {
        current = ts.createSourceFile(sourceFile.fileName, result, sourceFile.languageVersion, true);
        code = result;
    }

    result = transformReactiveArrays(current, bindings, ns);

    if (result !== code) {
        current = ts.createSourceFile(sourceFile.fileName, result, sourceFile.languageVersion, true);
        code = result;
    }

    result = transformReactivePrimitives(current, bindings, ns);

    if (result !== code) {
        current = ts.createSourceFile(sourceFile.fileName, result, sourceFile.languageVersion, true);
        code = result;
    }

    if (code === original) {
        return { code, sourceFile, transformed: false };
    }

    code = `import * as ${ns} from '@esportsplus/reactivity';\n` + code;

    return {
        code,
        sourceFile: ts.createSourceFile(sourceFile.fileName, code, sourceFile.languageVersion, true),
        transformed: true
    };
};


export { createTransformer, mightNeedTransform, transform };
export { transformReactiveArrays } from './transforms/array';
export { transformReactiveObjects } from './transforms/object';
export { transformReactivePrimitives } from './transforms/primitives';

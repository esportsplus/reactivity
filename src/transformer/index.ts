import { uid } from '@esportsplus/typescript/transformer';
import type { Bindings, TransformResult } from '~/types';
import { mightNeedTransform } from './detector';
import { transformReactiveArrays } from './transforms/array';
import { transformReactiveObjects } from './transforms/object';
import { transformReactivePrimitives } from './transforms/primitives';
import { ts } from '@esportsplus/typescript';


let ns = uid('reactivity'),
    transforms = [transformReactiveObjects, transformReactiveArrays, transformReactivePrimitives];


const transform = (sourceFile: ts.SourceFile): TransformResult => {
    let bindings: Bindings = new Map(),
        code = sourceFile.getFullText(),
        current = sourceFile,
        result: string,
        transformed = false;

    if (!mightNeedTransform(code)) {
        return { code, sourceFile, transformed: false };
    }

    for (let i = 0, n = transforms.length; i < n; i++) {
        result = transforms[i](current, bindings, ns);

        if (result !== code) {
            current = ts.createSourceFile(sourceFile.fileName, result, sourceFile.languageVersion, true);
            code = result;
            transformed = true;
        }
    }

    if (transformed) {
        code = `import * as ${ns} from '@esportsplus/reactivity';\n` + code;
        sourceFile = ts.createSourceFile(sourceFile.fileName, code, sourceFile.languageVersion, true);
    }

    return { code, sourceFile, transformed };
};


export { mightNeedTransform, transform };

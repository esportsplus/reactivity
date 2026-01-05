import { ts } from '@esportsplus/typescript';
import { COMPILATION_NAMESPACE } from '~/constants.js';
import type { Bindings, TransformResult } from '~/types';
import { contains } from './detector';
import array from './transforms/array';
import object from './transforms/object';
import primitives from './transforms/primitives';


let transforms = [object, array, primitives];


const transform = (sourceFile: ts.SourceFile): TransformResult => {
    let bindings: Bindings = new Map(),
        code = sourceFile.getFullText(),
        current = sourceFile,
        result: string,
        transformed = false;

    if (!contains(code)) {
        return { code, sourceFile, transformed: false };
    }

    for (let i = 0, n = transforms.length; i < n; i++) {
        result = transforms[i](current, bindings, COMPILATION_NAMESPACE);

        if (result !== code) {
            current = ts.createSourceFile(sourceFile.fileName, result, sourceFile.languageVersion, true);
            code = result;
            transformed = true;
        }
    }

    if (transformed) {
        code = `import * as ${COMPILATION_NAMESPACE} from '@esportsplus/reactivity';\n` + code;
        sourceFile = ts.createSourceFile(sourceFile.fileName, code, sourceFile.languageVersion, true);
    }

    return { code, sourceFile, transformed };
};


export { contains, transform };

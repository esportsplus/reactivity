import { TRANSFORM_PATTERN } from '@esportsplus/typescript/transformer';
import { createTransformer, mightNeedTransform } from '~/transformer';
import type { Plugin } from 'vite';
import { ts } from '@esportsplus/typescript';


export default (): Plugin => {
    return {
        enforce: 'pre',
        name: '@esportsplus/reactivity/plugin-vite',

        transform(code: string, id: string) {
            if (!TRANSFORM_PATTERN.test(id) || id.includes('node_modules')) {
                return null;
            }

            if (!mightNeedTransform(code)) {
                return null;
            }

            try {
                let printer = ts.createPrinter(),
                    sourceFile = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true),
                    transformer = createTransformer(),
                    result = ts.transform(sourceFile, [transformer]),
                    transformed = result.transformed[0];

                if (transformed === sourceFile) {
                    result.dispose();
                    return null;
                }

                let output = printer.printFile(transformed);

                result.dispose();

                return { code: output, map: null };
            }
            catch (error) {
                console.error(`@esportsplus/reactivity: Error transforming ${id}:`, error);
                return null;
            }
        }
    };
};

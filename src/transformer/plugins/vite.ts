import { TRANSFORM_PATTERN } from '@esportsplus/typescript/transformer';
import { mightNeedTransform, transform } from '~/transformer';
import type { Plugin } from 'vite';
import type { TransformOptions } from '~/types';
import ts from 'typescript';


export default (options?: TransformOptions): Plugin => {
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
                let sourceFile = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true),
                    result = transform(sourceFile, options);

                if (!result.transformed) {
                    return null;
                }

                return { code: result.code, map: null };
            }
            catch (error) {
                console.error(`@esportsplus/reactivity: Error transforming ${id}:`, error);
                return null;
            }
        }
    };
};
export type { TransformOptions as PluginOptions };

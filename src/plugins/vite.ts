import type { Plugin } from 'vite';
import ts from 'typescript';
import { mightNeedTransform, transform } from '~/core';
import type { TransformOptions } from '~/types';


let TRANSFORM_PATTERN = /\.[tj]sx?$/;


const plugin = (options?: TransformOptions): Plugin => {
    return {
        enforce: 'pre',
        name: 'vite-plugin-reactivity-compile',

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


export { plugin };
export type { TransformOptions as PluginOptions };

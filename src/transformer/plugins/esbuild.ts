import { TRANSFORM_PATTERN } from '@esportsplus/typescript/transformer';
import { mightNeedTransform, transform } from '~/transformer';
import type { OnLoadArgs, Plugin, PluginBuild } from 'esbuild';
import type { TransformOptions } from '~/types';
import fs from 'fs';
import ts from 'typescript';


export default (options?: TransformOptions): Plugin => {
    return {
        name: '@esportsplus/reactivity/plugin-esbuild',

        setup(build: PluginBuild) {
            build.onLoad({ filter: TRANSFORM_PATTERN }, async (args: OnLoadArgs) => {
                let code = await fs.promises.readFile(args.path, 'utf8');

                if (!mightNeedTransform(code)) {
                    return null;
                }

                try {
                    let sourceFile = ts.createSourceFile(
                            args.path,
                            code,
                            ts.ScriptTarget.Latest,
                            true
                        ),
                        result = transform(sourceFile, options);

                    if (!result.transformed) {
                        return null;
                    }

                    return {
                        contents: result.code,
                        loader: args.path.endsWith('x') ? 'tsx' : 'ts'
                    };
                }
                catch (error) {
                    console.error(`@esportsplus/reactivity: Error transforming ${args.path}:`, error);
                    return null;
                }
            });
        }
    };
};
export type { TransformOptions as PluginOptions };

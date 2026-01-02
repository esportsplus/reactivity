import type { OnLoadArgs, Plugin, PluginBuild } from 'esbuild';
import fs from 'fs';
import ts from 'typescript';
import { mightNeedTransform, transform } from '~/core';
import type { TransformOptions } from '~/types';


const plugin = (options?: TransformOptions): Plugin => {
    return {
        name: 'reactivity-transform',

        setup(build: PluginBuild) {
            build.onLoad({ filter: /\.[tj]sx?$/ }, async (args: OnLoadArgs) => {
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


export { plugin };
export type { TransformOptions as PluginOptions };

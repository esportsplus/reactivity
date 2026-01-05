import { TRANSFORM_PATTERN } from '@esportsplus/typescript/transformer';
import { mightNeedTransform, transform } from '~/transformer';
import type { Plugin } from 'vite';
import { ts } from '@esportsplus/typescript';


export default (): Plugin => {
    return {
        enforce: 'pre',
        name: '@esportsplus/reactivity/plugin-vite',
        transform(code: string, id: string) {
            if (!TRANSFORM_PATTERN.test(id) || id.includes('node_modules') || !mightNeedTransform(code)) {
                return null;
            }

            try {
                let result = transform(
                        ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true)
                    );

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

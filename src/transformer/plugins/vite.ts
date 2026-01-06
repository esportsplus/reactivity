import type { Plugin } from 'vite';
import { ts } from '@esportsplus/typescript';
import { TRANSFORM_PATTERN } from '@esportsplus/typescript/transformer';
import { PACKAGE } from '../../constants';
import { transform } from '..';


export default (): Plugin => {
    return {
        enforce: 'pre',
        name: `${PACKAGE}/plugin-vite`,
        transform(code: string, id: string) {
            if (!TRANSFORM_PATTERN.test(id) || id.includes('node_modules')) {
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
                console.error(`${PACKAGE}: Error transforming ${id}:`, error);
                return null;
            }
        }
    };
};

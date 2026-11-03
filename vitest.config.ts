import { defineConfig } from 'vitest/config';
import { resolve } from 'path';


export default defineConfig({
    resolve: {
        alias: {
            '@esportsplus/reactivity': resolve(import.meta.dirname, 'src/index.ts'),
            '~': resolve(import.meta.dirname, 'src')
        }
    },
    test: {
        benchmark: {
            include: ['bench/**/*.bench.ts']
        },
        include: ['test/**/*.test.ts']
    }
});

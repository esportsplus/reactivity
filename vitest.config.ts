import { defineConfig } from 'vitest/config';
import { resolve } from 'path';


export default defineConfig({
    resolve: {
        alias: {
            '~': resolve(import.meta.dirname, 'src'),
            '@esportsplus/reactivity': resolve(import.meta.dirname, 'src/index.ts')
        }
    },
    test: {
        benchmark: {
            include: ['bench/**/*.bench.ts']
        },
        include: ['test/**/*.test.ts']
    }
});

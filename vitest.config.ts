import { defineConfig } from 'vitest/config';
import { resolve } from 'path';


export default defineConfig({
    resolve: {
        alias: {
            '~': resolve(__dirname, 'src'),
            '@esportsplus/reactivity': resolve(__dirname, 'src/index.ts')
        }
    },
    test: {
        benchmark: {
            include: ['bench/**/*.bench.ts']
        },
        include: ['test/**/*.test.ts']
    }
});

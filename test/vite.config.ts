import { resolve } from 'path';
import { defineConfig } from 'vite';
import reactivity from '../build/transformer/plugins/vite.js';


export default defineConfig({
    build: {
        lib: {
            entry: {
                arrays: resolve(__dirname, 'arrays.ts'),
                effects: resolve(__dirname, 'effects.ts'),
                index: resolve(__dirname, 'index.ts'),
                nested: resolve(__dirname, 'nested.ts'),
                objects: resolve(__dirname, 'objects.ts'),
                primitives: resolve(__dirname, 'primitives.ts')
            },
            formats: ['es']
        },
        minify: false,
        outDir: resolve(__dirname, 'build'),
        rollupOptions: {
            external: ['@esportsplus/utilities'],
            output: {
                entryFileNames: '[name].js'
            }
        },
        target: 'esnext'
    },
    plugins: [
        reactivity()
    ],
    resolve: {
        alias: {
            '@esportsplus/reactivity/constants': resolve(__dirname, '../src/constants'),
            '@esportsplus/reactivity/reactive/array': resolve(__dirname, '../src/reactive/array'),
            '@esportsplus/reactivity': resolve(__dirname, '../src'),
            '~': resolve(__dirname, '../src')
        }
    }
});

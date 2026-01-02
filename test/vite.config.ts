import { resolve } from 'path';
import { defineConfig } from 'vite';
import { plugin as reactivity } from '../build/refactoring/plugins/vite.js';


export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'index.ts'),
            fileName: 'index',
            formats: ['es']
        },
        minify: false,
        outDir: resolve(__dirname, 'build'),
        rollupOptions: {
            external: ['@esportsplus/utilities']
        },
        target: 'esnext'
    },
    plugins: [
        reactivity()
    ],
    resolve: {
        alias: {
            '@esportsplus/reactivity/constants': resolve(__dirname, '../src/refactoring/constants'),
            '@esportsplus/reactivity/reactive/array': resolve(__dirname, '../src/refactoring/reactive/array'),
            '@esportsplus/reactivity': resolve(__dirname, '../src/refactoring'),
            '~': resolve(__dirname, '../src')
        }
    }
});

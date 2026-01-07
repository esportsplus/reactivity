import type { ImportIntent, Plugin, ReplacementIntent, TransformContext } from '@esportsplus/typescript/compiler';
import { ts } from '@esportsplus/typescript';
import { ast, imports } from '@esportsplus/typescript/compiler';
import { COMPILER_ENTRYPOINT, COMPILER_NAMESPACE, PACKAGE } from '~/constants';
import type { Bindings } from '~/types';
import array from './array';
import object from './object';


function hasReactiveImport(sourceFile: ts.SourceFile): boolean {
    return imports.find(sourceFile, PACKAGE).some(i => i.specifiers.has(COMPILER_ENTRYPOINT));
}

function isReactiveCallNode(node: ts.Node): boolean {
    return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === COMPILER_ENTRYPOINT;
}


const plugin: Plugin = {
    patterns: ['reactive(', 'reactive<'],

    transform: (ctx: TransformContext) => {
        if (!hasReactiveImport(ctx.sourceFile)) {
            return {};
        }

        let bindings: Bindings = new Map(),
            importsIntent: ImportIntent[] = [],
            prepend: string[] = [],
            replacements: ReplacementIntent[] = [];

        // Run object transform
        let objectResult = object(ctx.sourceFile, bindings, ctx.checker);

        prepend.push(...objectResult.prepend);
        replacements.push(...objectResult.replacements);

        // Run array transform
        let arrayResult = array(ctx.sourceFile, bindings, ctx.checker);

        replacements.push(...arrayResult);

        // Build import intent
        if (replacements.length > 0 || prepend.length > 0) {
            let remove: string[] = [];

            // Check if we still have reactive() calls after transform
            // This is a heuristic - if we have no replacements for reactive calls, keep the import
            if (!ast.hasMatch(ctx.sourceFile, isReactiveCallNode) || replacements.length > 0) {
                remove.push(COMPILER_ENTRYPOINT);
            }

            importsIntent.push({
                namespace: COMPILER_NAMESPACE,
                package: PACKAGE,
                remove
            });
        }

        return {
            imports: importsIntent,
            prepend,
            replacements
        };
    }
};


export default plugin;

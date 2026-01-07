import type { ImportIntent, Plugin, ReplacementIntent, TransformContext } from '@esportsplus/typescript/compiler';
import { ts } from '@esportsplus/typescript';
import { imports } from '@esportsplus/typescript/compiler';
import { COMPILER_ENTRYPOINT, COMPILER_NAMESPACE, PACKAGE } from '~/constants';
import type { Bindings } from '~/types';
import array from './array';
import object from './object';
import primitives from './primitives';


type FindRemainingContext = {
    checker: ts.TypeChecker | undefined;
    replacements: ReplacementIntent[];
    sourceFile: ts.SourceFile;
    transformedNodes: Set<ts.Node>;
};

function findRemainingCalls(
    checker: ts.TypeChecker | undefined,
    sourceFile: ts.SourceFile,
    transformedNodes: Set<ts.Node>
): ReplacementIntent[] {
    let ctx: FindRemainingContext = { checker, replacements: [], sourceFile, transformedNodes };

    visit(ctx, sourceFile);

    return ctx.replacements;
}

function isReactiveCallExpression(checker: ts.TypeChecker | undefined, node: ts.Node): node is ts.CallExpression {
    if (!ts.isCallExpression(node)) {
        return false;
    }

    let expr = node.expression;

    // Direct call: reactive(...) or aliasedName(...)
    if (ts.isIdentifier(expr)) {
        // Fast path: literal "reactive"
        if (expr.text === COMPILER_ENTRYPOINT) {
            return true;
        }

        // Use checker to resolve aliases
        if (checker) {
            return imports.inPackage(checker, expr, PACKAGE, COMPILER_ENTRYPOINT);
        }
    }

    // Property access: ns.reactive(...)
    if (ts.isPropertyAccessExpression(expr) && expr.name.text === COMPILER_ENTRYPOINT && checker) {
        return imports.inPackage(checker, expr, PACKAGE);
    }

    return false;
}

function visit(ctx: FindRemainingContext, node: ts.Node): void {
    // Check if call or its expression has already been transformed
    if (isReactiveCallExpression(ctx.checker, node) && !ctx.transformedNodes.has(node) && !ctx.transformedNodes.has(node.expression)) {
        ctx.replacements.push({
            generate: () => `${COMPILER_NAMESPACE}.reactive(${node.arguments.map(a => a.getText(ctx.sourceFile)).join(', ')})`,
            node
        });
    }

    ts.forEachChild(node, n => visit(ctx, n));
}


const plugin: Plugin = {
    patterns: ['reactive(', 'reactive<'],

    transform: (ctx: TransformContext) => {
        if (!imports.find(ctx.sourceFile, PACKAGE).some(i => i.specifiers.has(COMPILER_ENTRYPOINT))) {
            return {};
        }

        let bindings: Bindings = new Map(),
            importsIntent: ImportIntent[] = [],
            isReactive = (node: ts.Node) => isReactiveCallExpression(ctx.checker, node),
            prepend: string[] = [],
            replacements: ReplacementIntent[] = [];

        // Run primitives transform first (tracks bindings for signal/computed)
        replacements.push(...primitives(ctx.sourceFile, bindings, isReactive));

        // Run object transform
        let objectResult = object(ctx.sourceFile, bindings);

        prepend.push(...objectResult.prepend);
        replacements.push(...objectResult.replacements);

        // Run array transform separately ( avoid race conditions )
        replacements.push(...array(ctx.sourceFile, bindings));

        // Find remaining reactive() calls that weren't transformed and replace with namespace version
        replacements.push(...findRemainingCalls(ctx.checker, ctx.sourceFile, new Set(replacements.map(r => r.node))));

        // Build import intent
        if (replacements.length > 0 || prepend.length > 0) {
            importsIntent.push({
                namespace: COMPILER_NAMESPACE,
                package: PACKAGE,
                remove: [COMPILER_ENTRYPOINT]
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

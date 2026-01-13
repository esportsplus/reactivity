import type { ImportIntent, ReplacementIntent, TransformContext } from '@esportsplus/typescript/compiler';
import { ts } from '@esportsplus/typescript';
import { imports } from '@esportsplus/typescript/compiler';
import { ENTRYPOINT, NAMESPACE, PACKAGE_NAME } from './constants';
import type { Bindings } from './types';
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
        // Use checker to verify symbol origin (handles re-exports)
        if (checker) {
            return imports.includes(checker, expr, PACKAGE_NAME, ENTRYPOINT);
        }

        // Fallback without checker: match by name only
        return expr.text === ENTRYPOINT;
    }

    // Property access: ns.reactive(...)
    if (ts.isPropertyAccessExpression(expr) && expr.name.text === ENTRYPOINT && checker) {
        return imports.includes(checker, expr, PACKAGE_NAME);
    }

    return false;
}

function hasReactiveCalls(checker: ts.TypeChecker | undefined, node: ts.Node): boolean {
    if (isReactiveCallExpression(checker, node)) {
        return true;
    }

    let found = false;

    ts.forEachChild(node, child => {
        if (!found && hasReactiveCalls(checker, child)) {
            found = true;
        }
    });

    return found;
}

function visit(ctx: FindRemainingContext, node: ts.Node): void {
    // Check if call or its expression has already been transformed
    if (isReactiveCallExpression(ctx.checker, node) && !ctx.transformedNodes.has(node) && !ctx.transformedNodes.has(node.expression)) {
        ctx.replacements.push({
            generate: () => `${NAMESPACE}.reactive(${node.arguments.map(a => a.getText(ctx.sourceFile)).join(', ')})`,
            node
        });
    }

    ts.forEachChild(node, n => visit(ctx, n));
}


export default {
    patterns: ['reactive(', 'reactive<'],
    transform: (ctx: TransformContext) => {
        // Use TypeChecker to detect reactive calls from any source (including re-exports)
        if (!hasReactiveCalls(ctx.checker, ctx.sourceFile)) {
            return {};
        }

        let bindings: Bindings = new Map(),
            intents = {
                imports: [] as ImportIntent[],
                prepend: [] as string[],
                replacements: [] as ReplacementIntent[]
            };

        // Run primitives transform first (tracks bindings for signal/computed)
        intents.replacements.push(
            ...primitives(ctx.sourceFile, bindings, (node: ts.Node) => isReactiveCallExpression(ctx.checker, node))
        );

        // Run object transform
        let { prepend, replacements } = object(ctx.sourceFile, bindings, ctx.checker);

        intents.prepend.push(...prepend);
        intents.replacements.push(...replacements);

        // Run array transform separately ( avoid race conditions )
        intents.replacements.push(...array(ctx.sourceFile, bindings, ctx.checker));

        // Find remaining reactive() calls that weren't transformed and replace with namespace version
        intents.replacements.push(
            ...findRemainingCalls(ctx.checker, ctx.sourceFile, new Set(intents.replacements.map(r => r.node)))
        );

        // Build import intent
        if (intents.replacements.length > 0 || intents.prepend.length > 0) {
            intents.imports.push({
                namespace: NAMESPACE,
                package: PACKAGE_NAME,
                remove: [ENTRYPOINT]
            });
        }

        return intents;
    }
};

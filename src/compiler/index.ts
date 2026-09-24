import { ts } from '@esportsplus/typescript';
import { imports } from '@esportsplus/typescript/compiler';
import type { ImportIntent, ReplacementIntent, TransformContext } from '@esportsplus/typescript/compiler';
import { ENTRYPOINT, NAMESPACE, PACKAGE_NAME } from './constants';

import array from './array';
import object from './object';
import primitives from './primitives';
import scope from './bindings';


// Resolved once per file: every pass asks the same question of the same nodes
function collect(checker: ts.Checker, node: ts.Node, calls: Set<ts.Node>): void {
    if (isReactiveCallExpression(checker, node)) {
        calls.add(node);
    }

    node.forEachChild(child => collect(checker, child, calls));
}

function isReactiveCallExpression(checker: ts.Checker, node: ts.Node): node is ts.CallExpression {
    if (!ts.isCallExpression(node)) {
        return false;
    }

    let expr = node.expression;

    // Direct call: reactive(...) or aliasedName(...)
    if (ts.isIdentifier(expr)) {
        return imports.includes(checker, expr, PACKAGE_NAME, ENTRYPOINT);
    }

    // Namespace call: ns.reactive(...) — the namespace identifier carries the import origin
    if (ts.isPropertyAccessExpression(expr) && expr.name.text === ENTRYPOINT && ts.isIdentifier(expr.expression)) {
        return imports.includes(checker, expr.expression, PACKAGE_NAME);
    }

    return false;
}


export default {
    patterns: ['reactive(', 'reactive<'],
    transform: (ctx: TransformContext) => {
        let checker = ctx.checker;

        if (!checker) {
            return {};
        }

        let bindings = scope.create(checker),
            candidates = new Set<ts.Node>(),
            intents = {
                imports: [] as ImportIntent[],
                prepend: [] as string[],
                replacements: [] as ReplacementIntent[]
            },
            sourceFile = ctx.sourceFile;

        collect(checker, sourceFile, candidates);

        if (candidates.size === 0) {
            return {};
        }

        let isReactiveCall = (node: ts.Node): node is ts.CallExpression => candidates.has(node);

        // Run primitives transform first (tracks bindings for signal/computed, collects every call)
        let { calls, replacements } = primitives(sourceFile, bindings, isReactiveCall);

        intents.replacements.push(...replacements);

        // Run object transform
        let objects = object(sourceFile, bindings, isReactiveCall);

        intents.prepend.push(...objects.prepend);
        intents.replacements.push(...objects.replacements);

        // Run array transform separately ( avoid race conditions )
        intents.replacements.push(...array(sourceFile, bindings, isReactiveCall));

        // Calls no transform claimed fall through to the runtime reactive()
        let transformed = new Set(intents.replacements.map(r => r.node));

        for (let i = 0, n = calls.length; i < n; i++) {
            let call = calls[i];

            if (transformed.has(call) || transformed.has(call.expression)) {
                continue;
            }

            intents.replacements.push({
                generate: () => `${NAMESPACE}.reactive(${call.arguments.map(a => a.getText(sourceFile)).join(', ')})`,
                node: call
            });
        }

        intents.imports.push({
            namespace: NAMESPACE,
            package: PACKAGE_NAME,
            remove: [ENTRYPOINT]
        });

        return intents;
    }
};

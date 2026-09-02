import { ts } from '@esportsplus/typescript';
import { imports } from '@esportsplus/typescript/compiler';
import type { ImportIntent, ReplacementIntent, TransformContext } from '@esportsplus/typescript/compiler';
import { ENTRYPOINT, NAMESPACE, PACKAGE_NAME } from './constants';
import type { Bindings } from './types';

import array from './array';
import object from './object';
import primitives from './primitives';


function isReactiveCallExpression(checker: ts.Checker, node: ts.Node): node is ts.CallExpression {
    if (!ts.isCallExpression(node)) {
        return false;
    }

    let expr = node.expression;

    // Direct call: reactive(...) or aliasedName(...)
    if (ts.isIdentifier(expr)) {
        return imports.includes(checker, expr, PACKAGE_NAME, ENTRYPOINT);
    }

    // Property access: ns.reactive(...)
    if (ts.isPropertyAccessExpression(expr) && expr.name.text === ENTRYPOINT) {
        return imports.includes(checker, expr, PACKAGE_NAME);
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

        let bindings: Bindings = new Map(),
            intents = {
                imports: [] as ImportIntent[],
                prepend: [] as string[],
                replacements: [] as ReplacementIntent[]
            },
            isReactiveCall = (node: ts.Node): node is ts.CallExpression => isReactiveCallExpression(checker, node),
            sourceFile = ctx.sourceFile;

        // Run primitives transform first (tracks bindings for signal/computed, collects every call)
        let { calls, replacements } = primitives(sourceFile, bindings, isReactiveCall);

        if (calls.length === 0) {
            return {};
        }

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

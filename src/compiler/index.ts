import type { ImportIntent, Plugin, ReplacementIntent, TransformContext } from '@esportsplus/typescript/compiler';
import { ts } from '@esportsplus/typescript';
import { imports } from '@esportsplus/typescript/compiler';
import { COMPILER_ENTRYPOINT, COMPILER_NAMESPACE, PACKAGE } from '~/constants';
import type { Bindings } from '~/types';
import array from './array';
import object from './object';
import primitives from './primitives';


function hasReactiveImport(sourceFile: ts.SourceFile): boolean {
    return imports.find(sourceFile, PACKAGE).some(i => i.specifiers.has(COMPILER_ENTRYPOINT));
}

function isReactiveSymbol(checker: ts.TypeChecker, node: ts.Node): boolean {
    let symbol = checker.getSymbolAtLocation(node);

    if (!symbol) {
        return false;
    }

    // Follow aliases to original symbol
    if (symbol.flags & ts.SymbolFlags.Alias) {
        symbol = checker.getAliasedSymbol(symbol);
    }

    let declarations = symbol.getDeclarations();

    if (!declarations || declarations.length === 0) {
        return false;
    }

    for (let i = 0, n = declarations.length; i < n; i++) {
        let decl = declarations[i],
            sourceFile = decl.getSourceFile();

        // Check if declaration is from our package
        if (sourceFile.fileName.includes(PACKAGE) || sourceFile.fileName.includes('reactivity')) {
            // Verify it's the reactive export
            if (symbol.name === COMPILER_ENTRYPOINT) {
                return true;
            }
        }
    }

    return false;
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
            return isReactiveSymbol(checker, expr);
        }
    }

    // Property access: ns.reactive(...)
    if (ts.isPropertyAccessExpression(expr) && expr.name.text === COMPILER_ENTRYPOINT && checker) {
        return isReactiveSymbol(checker, expr);
    }

    return false;
}


const plugin: Plugin = {
    patterns: ['reactive(', 'reactive<'],

    transform: (ctx: TransformContext) => {
        if (!hasReactiveImport(ctx.sourceFile)) {
            return {};
        }

        let bindings: Bindings = new Map(),
            importsIntent: ImportIntent[] = [],
            isReactiveCall = (node: ts.Node) => isReactiveCallExpression(ctx.checker, node),
            prepend: string[] = [],
            replacements: ReplacementIntent[] = [];

        // Run primitives transform first (tracks bindings for signal/computed)
        replacements.push(...primitives(ctx.sourceFile, bindings, isReactiveCall, ctx.checker));

        // Run object transform
        let objectResult = object(ctx.sourceFile, bindings, ctx.checker);

        prepend.push(...objectResult.prepend);
        replacements.push(...objectResult.replacements);

        // Run array transform
        let arrayResult = array(ctx.sourceFile, bindings, ctx.checker);

        replacements.push(...arrayResult);

        // Find remaining reactive() calls that weren't transformed and replace with namespace version
        let transformedNodes = new Set(replacements.map(r => r.node));

        function findRemainingReactiveCalls(node: ts.Node): void {
            if (isReactiveCall(node) && !transformedNodes.has(node)) {
                let call = node as ts.CallExpression;

                replacements.push({
                    generate: () => `${COMPILER_NAMESPACE}.reactive(${call.arguments.map(a => a.getText(ctx.sourceFile)).join(', ')})`,
                    node: call
                });
            }

            ts.forEachChild(node, findRemainingReactiveCalls);
        }

        findRemainingReactiveCalls(ctx.sourceFile);

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

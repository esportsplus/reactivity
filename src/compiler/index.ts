import { ts } from '@esportsplus/typescript';
import type { ImportIntent, ReplacementIntent, TransformContext } from '@esportsplus/typescript/compiler';
import { ENTRYPOINT, NAMESPACE, PACKAGE_NAME } from './constants';
import type { Failure } from './primitives';

import array from './array';
import object from './object';
import primitives from './primitives';
import scope from './bindings';


// Every use the compiler cannot lower fails the build, all of them reported at once: shipping one
// would leave an uncompiled reactive() or an unread signal in the output
function failed(sourceFile: ts.SourceFile, failures: Failure[]): Error {
    let lines: string[] = [];

    for (let i = 0, n = failures.length; i < n; i++) {
        let { message, node } = failures[i],
            position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

        lines.push(`  ${sourceFile.fileName}:${position.line + 1}:${position.character + 1}  ${message}: ${node.getText(sourceFile).split('\n')[0]}`);
    }

    return new Error(`${PACKAGE_NAME}: code that must be compiled cannot be:\n${lines.join('\n')}`);
}

function isConstList(node: ts.Node | undefined): boolean {
    return node !== undefined && ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.Const) !== 0;
}

// A use of `reactive` the compiler lowers: a callee, or a const alias whose own uses are sites
function isLowered(site: ts.Node): boolean {
    let parent = site.parent;

    while (parent && ts.isParenthesizedExpression(parent)) {
        site = parent;
        parent = site.parent;
    }

    if (!parent) {
        return false;
    }

    if (ts.isCallExpression(parent)) {
        return parent.expression === site;
    }

    if (ts.isVariableDeclaration(parent)) {
        // `const r = reactive` only: destructuring would pull a member out of the compiled value
        return parent.initializer === site && ts.isIdentifier(parent.name) && isConstList(parent.parent);
    }

    if (ts.isBindingElement(parent) && parent.propertyName === site) {
        let declaration: ts.Node | undefined = parent;

        while (declaration && !ts.isVariableDeclaration(declaration)) {
            declaration = declaration.parent;
        }

        return declaration !== undefined && isConstList(declaration.parent);
    }

    return false;
}


// `reactive`, or the member access naming it (`ns.reactive`, `ns['reactive']`)
function siteOf(identifier: ts.Node): ts.Node {
    let parent = identifier.parent!;

    if (
        (ts.isPropertyAccessExpression(parent) && parent.name === identifier) ||
        (ts.isElementAccessExpression(parent) && parent.argumentExpression === identifier)
    ) {
        return parent;
    }

    return identifier;
}


// No text patterns: a module can reach `reactive`, or read a reactive binding, under any name
// (a barrel's rename, a default re-export, a namespace), so every module is resolved against the
// program and compiled exactly where its values resolve to reactive declarations
export default {
    transform: (ctx: TransformContext) => {
        let { checker, program, sourceFile } = ctx,
            bindings = scope.create(checker, program, sourceFile),
            calls = new Set<ts.Node>(),
            dependencies = new Set<string>(),
            failures: Failure[] = [],
            self = sourceFile.fileName.toLowerCase();

        for (let [identifier, found] of bindings.origins) {
            let entry = scope.holds(bindings, found);

            if (!entry && scope.kind(bindings, found) === null) {
                continue;
            }

            for (let file of [...found.through, found.declaration.path]) {
                if (file.toLowerCase() !== self) {
                    dependencies.add(file);
                }
            }

            if (!entry) {
                continue;
            }

            let site = siteOf(identifier),
                parent = site.parent;

            while (parent && ts.isParenthesizedExpression(parent)) {
                parent = parent.parent;
            }

            if (parent && ts.isCallExpression(parent) && scope.unwrap(parent.expression) === site) {
                calls.add(parent);
            }
            else if (!isLowered(site)) {
                failures.push({
                    message: `${ENTRYPOINT} is compiled away, so it can only be called (or aliased with const); it cannot be used as a value`,
                    node: site
                });
            }
        }

        let isReactiveCall = (node: ts.Node): node is ts.CallExpression => calls.has(node),
            intents = {
                imports: [] as ImportIntent[],
                prepend: [] as string[],
                replacements: [] as ReplacementIntent[]
            };

        // Signals and computeds first: every call is classified and every binding read is rewritten
        let lowered = primitives(sourceFile, bindings, isReactiveCall);

        failures.push(...lowered.failures);
        intents.replacements.push(...lowered.replacements);

        let objects = object(sourceFile, bindings, isReactiveCall);

        intents.prepend.push(...objects.prepend);
        intents.replacements.push(...objects.replacements);

        let arrays = array(sourceFile, bindings, isReactiveCall);

        failures.push(...arrays.failures);
        intents.replacements.push(...arrays.replacements);

        // An array is reactive because of where it was declared; that module shapes this compile
        for (let i = 0, n = arrays.reactive.length; i < n; i++) {
            let root = arrays.reactive[i];

            while (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root) || ts.isParenthesizedExpression(root)) {
                root = root.expression;
            }

            let found = ts.isIdentifier(root) ? scope.origin(bindings, root) : null;

            if (found && found.declaration.path.toLowerCase() !== self) {
                dependencies.add(found.declaration.path);
            }
        }

        if (failures.length > 0) {
            throw failed(sourceFile, failures);
        }

        // An object literal the object transform cannot specialize (a spread) is built by the runtime
        let transformed = new Set(intents.replacements.map(r => r.node));

        for (let i = 0, n = lowered.calls.length; i < n; i++) {
            let call = lowered.calls[i];

            if (transformed.has(call) || transformed.has(call.expression)) {
                continue;
            }

            intents.replacements.push({
                generate: () => `${NAMESPACE}.reactive(${call.arguments.map(a => a.getText(sourceFile)).join(', ')})`,
                node: call
            });
        }

        if (intents.replacements.length === 0 && intents.prepend.length === 0) {
            return dependencies.size > 0 ? { dependencies: [...dependencies] } : {};
        }

        // `.length` / element-write rewrites alone call methods on the array itself
        if (calls.size > 0 || lowered.replacements.length > 0 || intents.prepend.length > 0 || arrays.namespaced) {
            intents.imports.push({
                namespace: NAMESPACE,
                package: PACKAGE_NAME,
                remove: [ENTRYPOINT]
            });
        }

        return { dependencies: [...dependencies], ...intents };
    }
};

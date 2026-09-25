import { ts } from '@esportsplus/typescript';
import { references } from '@esportsplus/typescript/compiler';
import type { Origin } from '@esportsplus/typescript/compiler';
import { ENTRYPOINT, PACKAGE_NAME, TYPES } from './constants';
import type { Bindings } from './types';


type Assignment = { call: ts.CallExpression; target: ts.Identifier };

// Per program snapshot: answers about declarations and types hold for the snapshot's lifetime
type Caches = {
    arrays: Map<number, boolean>;
    assignments: Map<string, Map<string, Assignment[]>>;
    kinds: Map<string, TYPES | null>;
};


const ARRAY_BRAND = 'once';

const REACTIVE_ARRAY = 'ReactiveArray';


let caches = new WeakMap<ts.Program, Caches>();


// `x = reactive(...)` assignments in a file, keyed by the assigned name: a variable declared
// without a reactive initializer becomes a binding through one of these
function assignments(bindings: Bindings, file: ts.SourceFile): Map<string, Assignment[]> {
    let cache = cachesOf(bindings.program).assignments,
        found = cache.get(file.fileName);

    if (found) {
        return found;
    }

    let result = new Map<string, Assignment[]>(),
        visit = (node: ts.Node): void => {
            if (
                ts.isBinaryExpression(node) &&
                node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                ts.isIdentifier(node.left)
            ) {
                let call = unwrap(node.right);

                if (ts.isCallExpression(call)) {
                    let list = result.get(node.left.text);

                    if (!list) {
                        list = [];
                        result.set(node.left.text, list);
                    }

                    list.push({ call, target: node.left });
                }
            }

            node.forEachChild(visit);
        };

    visit(file);
    cache.set(file.fileName, result);

    return result;
}

function cachesOf(program: ts.Program): Caches {
    let found = caches.get(program);

    if (!found) {
        found = { arrays: new Map(), assignments: new Map(), kinds: new Map() };
        caches.set(program, found);
    }

    return found;
}

// Every member of a union must agree: `number | undefined` is a signal, `number[] | undefined` is
// neither a signal nor an array at runtime
function kindOf(checker: ts.Checker, type: ts.Type): TYPES | null {
    let members = (type.flags & ts.TypeFlags.Union) !== 0 ? (type as ts.UnionType).getTypes() : [type],
        result: TYPES | null = null;

    for (let i = 0, n = members.length; i < n; i++) {
        let kind = kindOfType(checker, members[i]);

        if (kind === null || (result !== null && result !== kind)) {
            return null;
        }

        result = kind;
    }

    return result;
}

// Kind of one non-union type as a reactive() argument; null when the type cannot say
function kindOfType(checker: ts.Checker, type: ts.Type): TYPES | null {
    if ((type.flags & ts.TypeFlags.TypeParameter) !== 0) {
        let constraint = checker.getBaseConstraintOfType(type);

        return constraint && constraint !== type ? kindOf(checker, constraint) : null;
    }

    if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Never | ts.TypeFlags.Unknown)) !== 0) {
        return null;
    }

    if ((type.flags & (
        ts.TypeFlags.BigIntLike |
        ts.TypeFlags.BooleanLike |
        ts.TypeFlags.EnumLike |
        ts.TypeFlags.ESSymbolLike |
        ts.TypeFlags.Null |
        ts.TypeFlags.NumberLike |
        ts.TypeFlags.StringLike |
        ts.TypeFlags.TemplateLiteral |
        ts.TypeFlags.Undefined |
        ts.TypeFlags.Void
    )) !== 0) {
        return TYPES.Signal;
    }

    if (checker.isArrayType(type) || checker.isTupleType(type)) {
        return TYPES.Array;
    }

    if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0) {
        return TYPES.Computed;
    }

    return (type.flags & (ts.TypeFlags.Intersection | ts.TypeFlags.NonPrimitive | ts.TypeFlags.Object)) !== 0 ? TYPES.Object : null;
}



// Expressions whose type is a ReactiveArray (`Reactive<T[]>` carries the class's members), resolved
// in one checker round-trip. Found by type, a reactive array is recognized wherever it flows:
// imports, object properties, parameters, return values.
const arrays = (bindings: Bindings, nodes: ts.Node[]): Set<ts.Node> => {
    let result = new Set<ts.Node>();

    if (nodes.length === 0) {
        return result;
    }

    let files = new Set(references.exported(bindings.checker, bindings.program, PACKAGE_NAME, REACTIVE_ARRAY).map(declaration => declaration.path));

    if (files.size === 0) {
        return result;
    }

    let cache = cachesOf(bindings.program).arrays,
        types = bindings.checker.getTypeAtLocation(nodes);

    for (let i = 0, n = nodes.length; i < n; i++) {
        let type = types[i];

        if (!type) {
            continue;
        }

        let branded = cache.get(type.id);

        if (branded === undefined) {
            let property = bindings.checker.getPropertyOfType(bindings.checker.getNonNullableType(type) ?? type, ARRAY_BRAND);

            branded = property?.declarations?.some(declaration => files.has(declaration.path)) === true;
            cache.set(type.id, branded);
        }

        if (branded) {
            result.add(nodes[i]);
        }
    }

    return result;
};

// Kind of a reactive() call from its argument: literal syntax first, the argument's type otherwise.
// Null when no kind is provable (no/extra arguments, `any`, `unknown`, a mixed union).
const classify = (bindings: Bindings, call: ts.CallExpression): TYPES | null => {
    let arg = call.arguments[0];

    if (!arg || call.arguments.length !== 1 || ts.isSpreadElement(arg)) {
        return null;
    }

    let value = unwrap(arg);

    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
        return TYPES.Computed;
    }

    if (ts.isArrayLiteralExpression(value)) {
        return TYPES.Array;
    }

    if (ts.isObjectLiteralExpression(value)) {
        return TYPES.Object;
    }

    let type = bindings.checker.getTypeAtLocation(arg);

    return type ? kindOf(bindings.checker, type) : null;
};

const create = (checker: ts.Checker, program: ts.Program, sourceFile: ts.SourceFile): Bindings => ({
    checker,
    entries: new Set(references.exported(checker, program, PACKAGE_NAME, ENTRYPOINT).map(references.key)),
    origins: references.origins(checker, program, sourceFile),
    program,
    sourceFile
});

// Whether a callee expression denotes `reactive`: `reactive`, an alias, `ns.reactive`, `ns['reactive']`
const denotes = (bindings: Bindings, expression: ts.Expression): boolean => {
    return references.denotes(bindings.checker, bindings.program, expression, bindings.entries);
};

// Whether a value holds `reactive`: the export itself, reached through any import, re-export or
// namespace, or a const binding (`const r = reactive`, `const { reactive: r } = ns`) holding it
const holds = (bindings: Bindings, found: Origin | null): boolean => {
    return references.holds(bindings.checker, bindings.program, found, bindings.entries);
};

const isReactiveCall = (bindings: Bindings, node: ts.Node): node is ts.CallExpression => {
    return ts.isCallExpression(node) && denotes(bindings, node.expression);
};

// Reactive kind of the binding a declaration introduces, wherever it is read from: a variable
// initialized (or assigned) with reactive(), or a module's `export default reactive(...)`.
// Ambient declarations (.d.ts) never are: a published package's signals ship as Signal-typed.
const kind = (bindings: Bindings, found: Origin | null): TYPES | null => {
    if (!found) {
        return null;
    }

    let declaration = found.declaration;

    if (
        (declaration.kind !== ts.SyntaxKind.VariableDeclaration && declaration.kind !== ts.SyntaxKind.ExportAssignment) ||
        declaration.path.endsWith('.d.ts')
    ) {
        return null;
    }

    let cache = cachesOf(bindings.program).kinds,
        key = references.key(declaration),
        known = cache.get(key);

    if (known !== undefined) {
        return known;
    }

    cache.set(key, null);

    let node = declaration.resolve() as ts.Node | undefined,
        result: TYPES | null = null;

    if (node && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        let initializer = node.initializer && unwrap(node.initializer);

        if (initializer && isReactiveCall(bindings, initializer)) {
            result = classify(bindings, initializer);
        }
        else {
            let candidates = assignments(bindings, node.getSourceFile()).get(node.name.text) ?? [];

            for (let i = 0, n = candidates.length; i < n && result === null; i++) {
                let { call, target } = candidates[i],
                    assigned = origin(bindings, target);

                if (assigned && references.key(assigned.declaration) === key && isReactiveCall(bindings, call)) {
                    result = classify(bindings, call);
                }
            }
        }
    }
    else if (node && ts.isExportAssignment(node)) {
        let expression = unwrap(node.expression);

        if (isReactiveCall(bindings, expression)) {
            result = classify(bindings, expression);
        }
    }

    cache.set(key, result);

    return result;
};

const origin = (bindings: Bindings, node: ts.Node): Origin | null => {
    return bindings.origins.get(node) ?? references.origin(bindings.checker, bindings.program, node);
};


// The expression a value comes from, without parentheses, `!` and type assertions
const unwrap = (expression: ts.Expression): ts.Expression => {
    return references.unwrap(expression) as ts.Expression;
};


export default { arrays, classify, create, denotes, holds, isReactiveCall, kind, origin, unwrap };

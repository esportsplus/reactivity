import { ts } from '@esportsplus/typescript';
import { checker, references } from '@esportsplus/typescript/compiler';
import type { Origin } from '@esportsplus/typescript/compiler';
import { ENTRYPOINT, PACKAGE_NAME, TYPES } from './constants';
import type { Bindings } from './types';


type Assignment = { call: ts.CallExpression; target: ts.Identifier };

// Per program snapshot. `kinds` saves no checker round-trip (the shared memo answers every query it
// makes), but kind() runs on every read of a binding and re-deriving it per read dominates a warm
// transform; concurrent transforms reading one binding await the one derivation
type Caches = {
    assignments: Map<string, Map<string, Assignment[]>>;
    kinds: Map<string, Promise<TYPES | null>>;
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
        found = { assignments: new Map(), kinds: new Map() };
        caches.set(program, found);
    }

    return found;
}

// Kind of the binding a declaration introduces (see kind())
async function derive(bindings: Bindings, declaration: Origin['declaration'], key: string): Promise<TYPES | null> {
    let node = await declaration.resolve() as ts.Node | undefined;

    if (node && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        let initializer = node.initializer && unwrap(node.initializer);

        if (initializer && await isReactiveCall(bindings, initializer)) {
            return classify(bindings, initializer as ts.CallExpression);
        }

        let candidates = assignments(bindings, node.getSourceFile()).get(node.name.text) ?? [];

        for (let i = 0, n = candidates.length; i < n; i++) {
            let { call, target } = candidates[i],
                assigned = await origin(bindings, target);

            if (assigned && references.key(assigned.declaration) === key && await isReactiveCall(bindings, call)) {
                let result = await classify(bindings, call);

                if (result !== null) {
                    return result;
                }
            }
        }

        return null;
    }

    if (node && ts.isExportAssignment(node)) {
        let expression = unwrap(node.expression);

        if (await isReactiveCall(bindings, expression)) {
            return classify(bindings, expression as ts.CallExpression);
        }
    }

    return null;
}

// Every member of a union must agree: `number | undefined` is a signal, `number[] | undefined` is
// neither a signal nor an array at runtime
async function kindOf(checker: ts.Checker, type: ts.Type): Promise<TYPES | null> {
    let members = (type.flags & ts.TypeFlags.Union) !== 0 ? await (type as ts.UnionType).getTypes() ?? [] : [type],
        kinds = await Promise.all(members.map((member) => kindOfType(checker, member))),
        result: TYPES | null = null;

    for (let i = 0, n = kinds.length; i < n; i++) {
        let kind = kinds[i];

        if (kind === null || (result !== null && result !== kind)) {
            return null;
        }

        result = kind;
    }

    return result;
}

// Kind of one non-union type as a reactive() argument; null when the type cannot say
async function kindOfType(checker: ts.Checker, type: ts.Type): Promise<TYPES | null> {
    if ((type.flags & ts.TypeFlags.TypeParameter) !== 0) {
        let constraint = await checker.getBaseConstraintOfType(type);

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

    if (await checker.isArrayType(type) || await checker.isTupleType(type)) {
        return TYPES.Array;
    }

    if ((await checker.getSignaturesOfType(type, ts.SignatureKind.Call)).length > 0) {
        return TYPES.Computed;
    }

    return (type.flags & (ts.TypeFlags.Intersection | ts.TypeFlags.NonPrimitive | ts.TypeFlags.Object)) !== 0 ? TYPES.Object : null;
}



// Expressions whose type is a ReactiveArray (`Reactive<T[]>` carries the class's members), resolved
// in one checker round-trip. Found by type, a reactive array is recognized wherever it flows:
// imports, object properties, parameters, return values.
const arrays = async (bindings: Bindings, nodes: ts.Node[]): Promise<Set<ts.Node>> => {
    let result = new Set<ts.Node>();

    if (nodes.length === 0) {
        return result;
    }

    let files = new Set((await references.exported(bindings.checker, bindings.program, PACKAGE_NAME, REACTIVE_ARRAY)).map(declaration => declaration.path));

    if (files.size === 0) {
        return result;
    }

    let types = await bindings.checker.getTypeAtLocation(nodes),
        properties = await Promise.all(types.map(async (type) => type && bindings.checker.getPropertyOfType(await bindings.checker.getNonNullableType(type) ?? type, ARRAY_BRAND)));

    for (let i = 0, n = nodes.length; i < n; i++) {
        if (properties[i]?.declarations?.some(declaration => files.has(declaration.path))) {
            result.add(nodes[i]);
        }
    }

    return result;
};

// Kind of a reactive() call from its argument: literal syntax first, the argument's type otherwise.
// Null when no kind is provable (no/extra arguments, `any`, `unknown`, a mixed union).
const classify = async (bindings: Bindings, call: ts.CallExpression): Promise<TYPES | null> => {
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

    let type = await bindings.checker.getTypeAtLocation(arg);

    return type ? kindOf(bindings.checker, type) : null;
};

// Memoized per program (an already memoized checker is kept as is), so batched and repeated queries
// share one cache whoever hands the checker in
const create = async (queries: ts.Checker, program: ts.Program, sourceFile: ts.SourceFile): Promise<Bindings> => {
    let memoized = checker.cached(queries, program),
        [exported, origins] = await Promise.all([
            references.exported(memoized, program, PACKAGE_NAME, ENTRYPOINT),
            references.origins(memoized, program, sourceFile)
        ]);

    return {
        checker: memoized,
        entries: new Set(exported.map(references.key)),
        origins,
        program,
        sourceFile
    };
};

// Whether a callee expression denotes `reactive`: `reactive`, an alias, `ns.reactive`, `ns['reactive']`
const denotes = (bindings: Bindings, expression: ts.Expression): Promise<boolean> => {
    return references.denotes(bindings.checker, bindings.program, expression, bindings.entries);
};

// Whether a value holds `reactive`: the export itself, reached through any import, re-export or
// namespace, or a const binding (`const r = reactive`, `const { reactive: r } = ns`) holding it
const holds = (bindings: Bindings, found: Origin | null): Promise<boolean> => {
    return references.holds(bindings.checker, bindings.program, found, bindings.entries);
};

const isReactiveCall = async (bindings: Bindings, node: ts.Node): Promise<boolean> => {
    return ts.isCallExpression(node) && denotes(bindings, node.expression);
};

// Reactive kind of the binding a declaration introduces, wherever it is read from: a variable
// initialized (or assigned) with reactive(), or a module's `export default reactive(...)`.
// Ambient declarations (.d.ts) never are: a published package's signals ship as Signal-typed.
const kind = (bindings: Bindings, found: Origin | null): Promise<TYPES | null> => {
    if (!found) {
        return Promise.resolve(null);
    }

    let declaration = found.declaration;

    if (
        (declaration.kind !== ts.SyntaxKind.VariableDeclaration && declaration.kind !== ts.SyntaxKind.ExportAssignment) ||
        declaration.path.endsWith('.d.ts')
    ) {
        return Promise.resolve(null);
    }

    let cache = cachesOf(bindings.program).kinds,
        key = references.key(declaration),
        known = cache.get(key);

    if (known === undefined) {
        known = derive(bindings, declaration, key);
        cache.set(key, known);
    }

    return known;
};

const origin = async (bindings: Bindings, node: ts.Node): Promise<Origin | null> => {
    return bindings.origins.get(node) ?? references.origin(bindings.checker, bindings.program, node);
};

// Types of the arguments classify() reads from the checker, requested in one round-trip; the
// memoized checker then answers each classify() from that request
const prefetch = async (bindings: Bindings, calls: ts.CallExpression[]): Promise<void> => {
    let nodes: ts.Node[] = [];

    for (let i = 0, n = calls.length; i < n; i++) {
        let arg = calls[i].arguments[0];

        if (!arg || calls[i].arguments.length !== 1 || ts.isSpreadElement(arg)) {
            continue;
        }

        let value = unwrap(arg);

        if (
            ts.isArrayLiteralExpression(value) ||
            ts.isArrowFunction(value) ||
            ts.isFunctionExpression(value) ||
            ts.isObjectLiteralExpression(value)
        ) {
            continue;
        }

        nodes.push(arg);
    }

    if (nodes.length > 0) {
        await bindings.checker.getTypeAtLocation(nodes);
    }
};


// The expression a value comes from, without parentheses, `!` and type assertions
const unwrap = (expression: ts.Expression): ts.Expression => {
    return references.unwrap(expression) as ts.Expression;
};


export default { arrays, classify, create, denotes, holds, isReactiveCall, kind, origin, prefetch, unwrap };

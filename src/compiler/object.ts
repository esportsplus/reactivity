import { code, imports, type ReplacementIntent } from '@esportsplus/typescript/compiler';
import { ts } from '@esportsplus/typescript';
import { uid } from '@esportsplus/typescript/compiler';
import { ENTRYPOINT, NAMESPACE, PACKAGE_NAME, TYPES } from './constants';
import type { Bindings } from './types';


interface AnalyzedProperty {
    isStatic: boolean;
    key: string;
    type: TYPES;
    valueText: string;
}

type ObjectTransformResult = {
    prepend: string[];
    replacements: ReplacementIntent[];
}

interface ReactiveObjectCall {
    classname: string;
    node: ts.CallExpression;
    properties: AnalyzedProperty[];
    typehint: string | null;
    varname: string | null;
}

interface VisitContext {
    bindings: Bindings;
    calls: ReactiveObjectCall[];
    checker: ts.TypeChecker | undefined;
    sourceFile: ts.SourceFile;
}


function analyzeProperty(prop: ts.ObjectLiteralElementLike, sourceFile: ts.SourceFile): AnalyzedProperty | null {
    if (!ts.isPropertyAssignment(prop)) {
        return null;
    }

    let key: string;

    if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) {
        key = prop.name.text;
    }
    else {
        return null;
    }

    let unwrapped = prop.initializer,
        value = unwrapped,
        valueText = value.getText(sourceFile);

    while (ts.isAsExpression(unwrapped) || ts.isTypeAssertionExpression(unwrapped) || ts.isParenthesizedExpression(unwrapped)) {
        unwrapped = unwrapped.expression;
    }

    if (ts.isArrowFunction(unwrapped) || ts.isFunctionExpression(unwrapped)) {
        return { isStatic: false, key, type: TYPES.Computed, valueText };
    }

    if (ts.isArrayLiteralExpression(unwrapped)) {
        let elements = unwrapped.elements,
            isStatic = value === unwrapped;

        for (let i = 0, n = elements.length; i < n; i++) {
            if (isStatic && !isStaticValue(elements[i])) {
                isStatic = false;
            }
        }

        return { isStatic, key, type: TYPES.Array, valueText };
    }

    return {
        isStatic: isStaticValue(value),
        key,
        type: TYPES.Signal,
        valueText
    };
}

function buildClassCode(classname: string, properties: AnalyzedProperty[], typehint: string | null): string {
    let accessors: string[] = [],
        body: string[] = [],
        constraint: string[] = [],
        fields: string[] = [],
        generics: string[] = [],
        parameters: string[] = [],
        setters = 0;

    for (let i = 0, n = properties.length; i < n; i++) {
        let { isStatic, key, type, valueText } = properties[i],
            generic = typehint ? `T['${key}']` : `T${parameters.length}`,
            parameter = `_p${parameters.length}`;

        // When typehint is present, treat signal properties as non-static to preserve types
        if (typehint && type === TYPES.Signal) {
            constraint.push(`'${key}'?: unknown`);
            isStatic = false;
        }

        if (type === TYPES.Signal) {
            let value = `_v${setters++}`;

            if (isStatic) {
                accessors.push(`
                    get ${key}() {
                        return ${NAMESPACE}.read(this.#${key});
                    }
                    set ${key}(${value}) {
                        ${NAMESPACE}.write(this.#${key}, ${value});
                    }
                `);
                fields.push(`#${key} = this[${NAMESPACE}.SIGNAL](${valueText});`);
            }
            else {
                accessors.push(`
                    get ${key}() {
                        return ${NAMESPACE}.read(this.#${key}) as ${generic};
                    }
                    set ${key}(${value}) {
                        ${NAMESPACE}.write(this.#${key}, ${value});
                    }
                `);
                body.push(`this.#${key} = this[${NAMESPACE}.SIGNAL](${parameter});`);
                fields.push(`#${key};`);

                if (!typehint) {
                    generics.push(generic);
                }

                parameters.push(`${parameter}: ${generic}`);
            }
        }
        else if (type === TYPES.Array) {
            if (typehint) {
                constraint.push(`'${key}'?: unknown[]`);
            }

            accessors.push(`
                get ${key}() {
                    return this.#${key};
                }
            `);
            body.push(`this.#${key} = this[${NAMESPACE}.REACTIVE_ARRAY](${parameter});`);
            fields.push(`#${key};`);

            if (!typehint) {
                generics.push(`${generic} extends unknown[]`);
            }

            parameters.push(`${parameter}: ${generic}`);
        }
        else if (type === TYPES.Computed) {
            if (typehint) {
                constraint.push(`'${key}'?: unknown`);
            }

            accessors.push(`
                get ${key}() {
                    return ${NAMESPACE}.read(this.#${key});
                }
            `);
            body.push(`this.#${key} = this[${NAMESPACE}.COMPUTED](${parameter});`);
            fields.push(`#${key};`);

            if (!typehint) {
                generics.push(`${generic} extends ${NAMESPACE}.Computed<ReturnType<${generic}>>['fn']`);
            }

            parameters.push(`${parameter}: ${generic}`);
        }
    }

    return code`
        class ${classname}${
            typehint
                ? `<T extends { ${constraint.join(', ')} }>`
                : generics.length !== 0 && `<${generics.join(', ')}>`
        } extends ${NAMESPACE}.ReactiveObject<any> {
            ${fields.join('\n')}

            constructor(${parameters.join(', ')}) {
                super(null);
                ${body.join('\n')}
            }

            ${accessors.join('\n')}
        }
    `;
}

function isStaticValue(node: ts.Node): boolean {
    return ts.isNumericLiteral(node) ||
        ts.isStringLiteral(node) ||
        node.kind === ts.SyntaxKind.TrueKeyword ||
        node.kind === ts.SyntaxKind.FalseKeyword ||
        node.kind === ts.SyntaxKind.NullKeyword ||
        node.kind === ts.SyntaxKind.UndefinedKeyword ||
        (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand));
}

function isReactiveCall(checker: ts.TypeChecker | undefined, node: ts.Node): node is ts.CallExpression {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) {
        return false;
    }

    let expr = node.expression;

    // Use checker to verify symbol origin (handles re-exports)
    if (checker) {
        return imports.includes(checker, expr, PACKAGE_NAME, ENTRYPOINT);
    }

    // Fallback without checker: match by name only
    return expr.text === ENTRYPOINT;
}

function visit(ctx: VisitContext, node: ts.Node): void {
    if (isReactiveCall(ctx.checker, node)) {
        let arg = node.arguments[0];

        if (arg && ts.isObjectLiteralExpression(arg)) {
            let properties: AnalyzedProperty[] = [],
                props = arg.properties,
                varname: string | null = null;

            if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
                varname = node.parent.name.text;
                ctx.bindings.set(varname, TYPES.Object);
            }

            for (let i = 0, n = props.length; i < n; i++) {
                let prop = props[i];

                if (ts.isSpreadAssignment(prop)) {
                    ts.forEachChild(node, n => visit(ctx, n));
                    return;
                }

                let analyzed = analyzeProperty(prop, ctx.sourceFile);

                if (!analyzed) {
                    ts.forEachChild(node, n => visit(ctx, n));
                    return;
                }

                properties.push(analyzed);

                if (analyzed.type === TYPES.Array && varname) {
                    ctx.bindings.set(`${varname}.${analyzed.key}`, TYPES.Array);
                }
            }

            ctx.calls.push({
                classname: uid('ReactiveObject'),
                node,
                properties,
                typehint: node.typeArguments?.[0]?.getText(ctx.sourceFile) ?? null,
                varname
            });
        }
    }

    ts.forEachChild(node, n => visit(ctx, n));
}


export default (sourceFile: ts.SourceFile, bindings: Bindings, checker?: ts.TypeChecker): ObjectTransformResult => {
    let ctx: VisitContext = {
            bindings,
            calls: [],
            checker,
            sourceFile
        };

    visit(ctx, sourceFile);

    let prepend: string[] = [],
        replacements: ReplacementIntent[] = [];

    for (let i = 0, n = ctx.calls.length; i < n; i++) {
        let call = ctx.calls[i],
            typehint = call.typehint;

        prepend.push(buildClassCode(call.classname, call.properties, typehint));
        replacements.push({
            generate: () => {
                let args = call.properties
                    .filter(({ isStatic, type }) => typehint || !isStatic || type === TYPES.Computed)
                    .map(p => p.valueText)
                    .join(', ');

                return typehint
                    ? ` new ${call.classname}<${typehint}>(${args})`
                    : ` new ${call.classname}(${args})`;
            },
            node: call.node,
        });
    }

    return { prepend, replacements };
};

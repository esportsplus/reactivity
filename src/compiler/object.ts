import type { ReplacementIntent } from '@esportsplus/typescript/compiler';
import { ts } from '@esportsplus/typescript';
import { uid } from '@esportsplus/typescript/compiler';
import { COMPILER_NAMESPACE, COMPILER_TYPES } from '~/constants';
import type { Bindings } from '~/types';


interface AnalyzedProperty {
    isStatic: boolean;
    key: string;
    type: COMPILER_TYPES;
    valueText: string;
}

interface ReactiveObjectCall {
    className: string;
    node: ts.CallExpression;
    properties: AnalyzedProperty[];
    varname: string | null;
}

interface VisitContext {
    bindings: Bindings;
    calls: ReactiveObjectCall[];
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
        return { isStatic: false, key, type: COMPILER_TYPES.Computed, valueText };
    }

    if (ts.isArrayLiteralExpression(unwrapped)) {
        let elements = unwrapped.elements,
            isStatic = value === unwrapped;

        for (let i = 0, n = elements.length; i < n; i++) {
            if (isStatic && !isStaticValue(elements[i])) {
                isStatic = false;
            }
        }

        return { isStatic, key, type: COMPILER_TYPES.Array, valueText };
    }

    return { isStatic: isStaticValue(value), key, type: COMPILER_TYPES.Signal, valueText };
}

function buildClassCode(className: string, properties: AnalyzedProperty[]): string {
    let accessors: string[] = [],
        body: string[] = [],
        fields: string[] = [],
        generics: string[] = [],
        parameters: string[] = [],
        setters = 0;

    for (let i = 0, n = properties.length; i < n; i++) {
        let { isStatic, key, type, valueText } = properties[i],
            generic = `T${parameters.length}`,
            parameter = `_p${parameters.length}`;

        if (type === COMPILER_TYPES.Signal) {
            let value = `_v${setters++}`;

            if (isStatic) {
                accessors.push(`
                    get ${key}() {
                        return ${COMPILER_NAMESPACE}.read(this.#${key});
                    }
                    set ${key}(${value}) {
                        ${COMPILER_NAMESPACE}.write(this.#${key}, ${value});
                    }
                `);
                fields.push(`#${key} = this[${COMPILER_NAMESPACE}.SIGNAL](${valueText});`);
            }
            else {
                accessors.push(`
                    get ${key}() {
                        return ${COMPILER_NAMESPACE}.read(this.#${key}) as ${generic};
                    }
                    set ${key}(${value}) {
                        ${COMPILER_NAMESPACE}.write(this.#${key}, ${value});
                    }
                `);
                body.push(`this.#${key} = this[${COMPILER_NAMESPACE}.SIGNAL](${parameter});`);
                fields.push(`#${key};`);
                generics.push(generic);
                parameters.push(`${parameter}: ${generic}`);
            }
        }
        else if (type === COMPILER_TYPES.Array) {
            accessors.push(`
                get ${key}() {
                    return this.#${key};
                }
            `);
            body.push(`this.#${key} = this[${COMPILER_NAMESPACE}.REACTIVE_ARRAY](${parameter});`);
            fields.push(`#${key};`);
            generics.push(`${generic} extends unknown[]`);
            parameters.push(`${parameter}: ${generic}`);
        }
        else if (type === COMPILER_TYPES.Computed) {
            accessors.push(`
                get ${key}() {
                    return ${COMPILER_NAMESPACE}.read(this.#${key});
                }
            `);
            body.push(`this.#${key} = this[${COMPILER_NAMESPACE}.COMPUTED](${parameter});`);
            fields.push(`#${key};`);
            generics.push(`${generic} extends ${COMPILER_NAMESPACE}.Computed<ReturnType<${generic}>>['fn']`);
            parameters.push(`${parameter}: ${generic}`);
        }
    }

    return `
        class ${className}${generics.length > 0 ? `<${generics.join(', ')}>` : ''} extends ${COMPILER_NAMESPACE}.ReactiveObject<any> {
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
    if (
        ts.isNumericLiteral(node) ||
        ts.isStringLiteral(node) ||
        node.kind === ts.SyntaxKind.TrueKeyword ||
        node.kind === ts.SyntaxKind.FalseKeyword ||
        node.kind === ts.SyntaxKind.NullKeyword ||
        node.kind === ts.SyntaxKind.UndefinedKeyword
    ) {
        return true;
    }

    if (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)) {
        return true;
    }

    return false;
}

function visit(ctx: VisitContext, node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'reactive') {
        let arg = node.arguments[0];

        if (arg && ts.isObjectLiteralExpression(arg)) {
            let properties: AnalyzedProperty[] = [],
                props = arg.properties,
                varname: string | null = null;

            if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
                varname = node.parent.name.text;
                ctx.bindings.set(varname, COMPILER_TYPES.Object);
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

                if (analyzed.type === COMPILER_TYPES.Array && varname) {
                    ctx.bindings.set(`${varname}.${analyzed.key}`, COMPILER_TYPES.Array);
                }
            }

            ctx.calls.push({
                className: uid('ReactiveObject'),
                node,
                properties,
                varname
            });
        }
    }

    ts.forEachChild(node, n => visit(ctx, n));
}


type ObjectTransformResult = {
    prepend: string[];
    replacements: ReplacementIntent[];
};


export default (sourceFile: ts.SourceFile, bindings: Bindings): ObjectTransformResult => {
    let ctx: VisitContext = {
            bindings,
            calls: [],
            sourceFile
        };

    visit(ctx, sourceFile);

    if (ctx.calls.length === 0) {
        return { prepend: [], replacements: [] };
    }

    let prepend: string[] = [],
        replacements: ReplacementIntent[] = [];

    for (let i = 0, n = ctx.calls.length; i < n; i++) {
        let call = ctx.calls[i];

        prepend.push(buildClassCode(call.className, call.properties));
        replacements.push({
            generate: () => ` new ${call.className}(${
                call.properties
                    .filter(({ isStatic, type }) => !isStatic || type === COMPILER_TYPES.Computed)
                    .map(p => p.valueText)
                    .join(', ')
            })`,
            node: call.node,
        });
    }

    return { prepend, replacements };
};

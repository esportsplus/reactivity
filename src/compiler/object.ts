import { ts } from '@esportsplus/typescript';
import { code as c, uid, type Replacement } from '@esportsplus/typescript/compiler';
import { COMPILER_NAMESPACE, COMPILER_TYPES } from '~/constants';
import type { Bindings } from '~/types';
import { isReactiveCall } from '.';


interface AnalyzedProperty {
    isStatic: boolean;
    key: string;
    type: COMPILER_TYPES;
    valueText: string;
}

interface ReactiveObjectCall {
    className: string;
    end: number;
    properties: AnalyzedProperty[];
    start: number;
    varName: string | null;
}

interface TransformContext {
    bindings: Bindings;
    calls: ReactiveObjectCall[];
    checker?: ts.TypeChecker;
    classCounter: number;
    lastImportEnd: number;
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

function visit(ctx: TransformContext, node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
        ctx.lastImportEnd = node.end;
    }

    if (
        ts.isCallExpression(node) &&
        isReactiveCall(node, ctx.checker)
    ) {
        let arg = node.arguments[0];

        if (arg && ts.isObjectLiteralExpression(arg)) {
            let properties: AnalyzedProperty[] = [],
                props = arg.properties,
                varName: string | null = null;

            if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
                varName = node.parent.name.text;
                ctx.bindings.set(varName, COMPILER_TYPES.Object);
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

                if (analyzed.type === COMPILER_TYPES.Array && varName) {
                    ctx.bindings.set(`${varName}.${analyzed.key}`, COMPILER_TYPES.Array);
                }
            }

            ctx.calls.push({
                className: uid('ReactiveObject'),
                end: node.end,
                properties,
                start: node.pos,
                varName
            });
        }
    }

    ts.forEachChild(node, n => visit(ctx, n));
}


export default (sourceFile: ts.SourceFile, bindings: Bindings, checker?: ts.TypeChecker): string => {
    let code = sourceFile.getFullText(),
        ctx: TransformContext = {
            bindings,
            calls: [],
            checker,
            classCounter: 0,
            lastImportEnd: 0,
            sourceFile
        };

    visit(ctx, sourceFile);

    if (ctx.calls.length === 0) {
        return code;
    }

    let classes = ctx.calls.map(c => buildClassCode(c.className, c.properties)).join('\n'),
        replacements: Replacement[] = [];

    replacements.push({
        end: ctx.lastImportEnd,
        newText: code.substring(0, ctx.lastImportEnd) + '\n' + classes + '\n',
        start: 0
    });

    for (let i = 0, n = ctx.calls.length; i < n; i++) {
        let call = ctx.calls[i];

        replacements.push({
            end: call.end,
            newText: ` new ${call.className}(${
                call.properties
                    .filter(({ isStatic, type }) => !isStatic || type === COMPILER_TYPES.Computed)
                    .map(p => p.valueText)
                    .join(', ')
            })`,
            start: call.start
        });
    }

    return c.replace(code, replacements);
};

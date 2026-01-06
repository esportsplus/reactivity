import { ts } from '@esportsplus/typescript';
import { code as c, uid, type Replacement } from '@esportsplus/typescript/compiler';
import { COMPILER_TYPES } from '~/constants';
import type { AliasKey, Aliases, Bindings } from '~/types';
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
    aliases: Aliases;
    bindings: Bindings;
    calls: ReactiveObjectCall[];
    checker?: ts.TypeChecker;
    classCounter: number;
    lastImportEnd: number;
    sourceFile: ts.SourceFile;
    used: Set<AliasKey>;
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

function buildClassCode(aliases: Aliases, className: string, properties: AnalyzedProperty[], used: Set<AliasKey>): string {
    let accessors: string[] = [],
        body: string[] = [],
        disposables: string[] = [],
        fields: string[] = [],
        generics: string[] = [],
        parameters: string[] = [],
        setters = 0;

    fields.push(`[${aliases.REACTIVE_OBJECT}] = true;`);
    used.add('REACTIVE_OBJECT');

    for (let i = 0, n = properties.length; i < n; i++) {
        let { isStatic, key, type, valueText } = properties[i];

        if (type === COMPILER_TYPES.Signal) {
            let setter = `_v${setters++}`;

            used.add('read');
            used.add('signal');
            used.add('write');

            if (isStatic) {
                accessors.push(`get ${key}() { return ${aliases.read}(this.#${key}); }`);
                fields.push(`#${key} = ${aliases.signal}(${valueText});`);
            }
            else {
                let generic = `T${parameters.length}`,
                    param = `_p${parameters.length}`;

                accessors.push(`get ${key}() { return ${aliases.read}(this.#${key}) as ${generic}; }`);
                body.push(`this.#${key} = ${aliases.signal}(${param});`);
                fields.push(`#${key};`);
                generics.push(generic);
                parameters.push(`${param}: ${generic}`);
            }

            accessors.push(`set ${key}(${setter}) { ${aliases.write}(this.#${key}, ${setter}); }`);
        }
        else if (type === COMPILER_TYPES.Array) {
            used.add('ReactiveArray');

            if (isStatic) {
                fields.push(`${key} = new ${aliases.ReactiveArray}(...${valueText});`);
            }
            else {
                let generic = `T${parameters.length}`,
                    param = `_p${parameters.length}`;

                body.push(`this.${key} = new ${aliases.ReactiveArray}(...${param});`);
                fields.push(`${key}!: ${aliases.ReactiveArray}<${generic}[number]>;`);
                generics.push(`${generic} extends unknown[]`);
                parameters.push(`${param}: ${generic}`);
            }

            disposables.push(`this.${key}.dispose();`);
        }
        else if (type === COMPILER_TYPES.Computed) {
            let generic = `T${parameters.length}`,
                param = `_p${parameters.length}`;

            used.add('computed');
            used.add('dispose');
            used.add('effect');
            used.add('isPromise');
            used.add('Reactive');
            used.add('read');
            used.add('root');
            used.add('signal');
            used.add('write');

            accessors.push(`
                get ${key}() {
                    return ${aliases.read}(this.#${key}) as ${aliases.Reactive}<${generic}>;
                }
            `);
            body.push(`
                this.#${key} = ${aliases.root}(() => {
                    this.#${key} = ${aliases.computed}(${param});

                    if (${aliases.isPromise}(this.#${key}.value)) {
                        let factory = this.#${key},
                            version = 0;

                        this.#${key} = ${aliases.signal}(undefined);

                        (this.#disposers ??= []).push(
                            ${aliases.effect}(() => {
                                let id = ++version;

                                (${aliases.read}(factory) as Promise<typeof factory>).then((v) => {
                                    if (id !== version) {
                                        return;
                                    }

                                    ${aliases.write}(this.#${key}, v);
                                });
                            })
                        );
                    }
                    else {
                        (this.#disposers ??= []).push(() => ${aliases.dispose}(this.#${key}));
                    }

                    return this.#${key};
                });
            `);
            fields.push(`#${key}: any;`);
            generics.push(generic);
            parameters.push(`${param}: () => ${generic}`);
        }
    }

    if (used.has('computed')) {
        fields.push(`#disposers: VoidFunction[] | null = null;`);
        disposables.push(`
            if (this.#disposers) {
                for (let i = 0, n = this.#disposers.length; i < n; i++) {
                    this.#disposers[i]();
                }
            }
        `);
    }

    return `
        class ${className}${generics.length > 0 ? `<${generics.join(', ')}>` : ''} {
            ${fields.join('\n')}
            ${
                parameters.length > 0
                    ? `constructor(${parameters.join(', ')}) { ${body.join('\n')} }`
                    : ''
            }
            ${accessors.join('\n')}

            dispose() {
                ${disposables.length > 0 ? disposables.join('\n') : ''}
            }
        }
    `;
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


export default (sourceFile: ts.SourceFile, bindings: Bindings, aliases: Aliases, used: Set<AliasKey>, checker?: ts.TypeChecker): string => {
    let code = sourceFile.getFullText(),
        ctx: TransformContext = {
            aliases,
            bindings,
            calls: [],
            checker,
            classCounter: 0,
            lastImportEnd: 0,
            sourceFile,
            used
        };

    visit(ctx, sourceFile);

    if (ctx.calls.length === 0) {
        return code;
    }

    let classes = ctx.calls.map(c => buildClassCode(aliases, c.className, c.properties, used)).join('\n'),
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


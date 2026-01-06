import { ts } from '@esportsplus/typescript';
import { code as c, imports, type Replacement } from '@esportsplus/typescript/compiler';
import { COMPILER_ENTRYPOINT, COMPILER_TYPES, PACKAGE } from '~/constants';
import type { AliasKey, Aliases, Bindings } from '~/types';


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

    let value = prop.initializer,
        valueText = value.getText(sourceFile);

    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
        return { isStatic: false, key, type: COMPILER_TYPES.Computed, valueText };
    }

    if (ts.isArrayLiteralExpression(value)) {
        let elements = value.elements,
            elementsText = '',
            isStatic = true;

        for (let i = 0, n = elements.length; i < n; i++) {
            if (i > 0) {
                elementsText += ', ';
            }

            let el = elements[i];

            elementsText += el.getText(sourceFile);

            if (isStatic && !isStaticValue(el)) {
                isStatic = false;
            }
        }

        return { isStatic, key, type: COMPILER_TYPES.Array, valueText: elementsText };
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
        constructorBody: string[] = [],
        constructorParams: string[] = [],
        disposeStatements: string[] = [],
        fields: string[] = [],
        paramCounter = 0,
        setterParamCounter = 0;

    used.add('REACTIVE_OBJECT');
    fields.push(`[${aliases.REACTIVE_OBJECT}] = true;`);

    for (let i = 0, n = properties.length; i < n; i++) {
        let { isStatic, key, type, valueText } = properties[i];

        if (type === COMPILER_TYPES.Signal) {
            let setterParam = `_v${setterParamCounter++}`;

            used.add('read');
            used.add('signal');
            used.add('write');

            if (isStatic) {
                fields.push(`#${key} = ${aliases.signal}(${valueText});`);
            }
            else {
                let param = `_p${paramCounter++}`;

                constructorParams.push(`${param}: unknown`);
                fields.push(`#${key};`);
                constructorBody.push(`this.#${key} = ${aliases.signal}(${param});`);
            }

            accessors.push(`get ${key}() { return ${aliases.read}(this.#${key}); }`);
            accessors.push(`set ${key}(${setterParam}) { ${aliases.write}(this.#${key}, ${setterParam}); }`);
        }
        else if (type === COMPILER_TYPES.Array) {
            used.add('ReactiveArray');

            if (isStatic) {
                fields.push(`${key} = new ${aliases.ReactiveArray}(${valueText});`);
            }
            else {
                let param = `_p${paramCounter++}`;

                constructorParams.push(`${param}: unknown[]`);
                fields.push(`${key};`);
                constructorBody.push(`this.${key} = new ${aliases.ReactiveArray}(...${param});`);
            }

            disposeStatements.push(`this.${key}.dispose();`);
        }
        else if (type === COMPILER_TYPES.Computed) {
            let param = `_p${paramCounter++}`;

            used.add('computed');
            used.add('dispose');
            used.add('read');
            constructorParams.push(`${param}: () => unknown`);
            fields.push(`#${key} = null;`);
            fields.push(`#_fn_${key};`);
            constructorBody.push(`this.#_fn_${key} = ${param};`);
            accessors.push(`get ${key}() { return ${aliases.read}(this.#${key} ??= ${aliases.computed}(this.#_fn_${key})); }`);
            disposeStatements.push(`if (this.#${key}) ${aliases.dispose}(this.#${key});`);
        }
    }

    let constructor = constructorParams.length > 0
        ? `constructor(${constructorParams.join(', ')}) {\n                ${constructorBody.join('\n                ')}\n            }`
        : '';

    return `
        class ${className} {
            ${fields.join('\n            ')}

            ${constructor}

            ${accessors.join('\n            ')}

            dispose() {
                ${disposeStatements.length > 0 ? disposeStatements.join('\n                ') : ''}
            }
        }
    `;
}

function buildConstructorArgs(properties: AnalyzedProperty[]): string {
    let args: string[] = [];

    for (let i = 0, n = properties.length; i < n; i++) {
        let { isStatic, type, valueText } = properties[i];

        if (isStatic && type !== COMPILER_TYPES.Computed) {
            continue;
        }

        if (type === COMPILER_TYPES.Array) {
            args.push(`[${valueText}]`);
        }
        else {
            args.push(valueText);
        }
    }

    return args.join(', ');
}

function isReactiveCall(node: ts.CallExpression, checker?: ts.TypeChecker): boolean {
    if (!ts.isIdentifier(node.expression)) {
        return false;
    }

    if (node.expression.text !== COMPILER_ENTRYPOINT) {
        return false;
    }

    return imports.isFromPackage(node.expression, PACKAGE, checker);
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

            // TODO: Use uid
            ctx.calls.push({
                className: `_RO${ctx.classCounter++}`,
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
            newText: ` new ${call.className}(${buildConstructorArgs(call.properties)})`,
            start: call.start
        });
    }

    return c.replace(code, replacements);
};


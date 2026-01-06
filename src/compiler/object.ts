import { ts } from '@esportsplus/typescript';
import { code as c, type Replacement } from '@esportsplus/typescript/compiler';
import { COMPILER_TYPES, PACKAGE } from '~/constants';
import type { Bindings } from '~/types';


interface AnalyzedProperty {
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
    classCounter: number;
    hasReactiveImport: boolean;
    lastImportEnd: number;
    ns: string;
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

    let value = prop.initializer,
        valueText = value.getText(sourceFile);

    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
        return { key, type: COMPILER_TYPES.Computed, valueText };
    }

    if (ts.isArrayLiteralExpression(value)) {
        let elements = value.elements,
            elementsText = '';

        for (let i = 0, n = elements.length; i < n; i++) {
            if (i > 0) {
                elementsText += ', ';
            }

            elementsText += elements[i].getText(sourceFile);
        }

        return { key, type: COMPILER_TYPES.Array, valueText: elementsText };
    }

    return { key, type: COMPILER_TYPES.Signal, valueText };
}

function buildClassCode(className: string, properties: AnalyzedProperty[], ns: string): string {
    let accessors: string[] = [],
        disposeStatements: string[] = [],
        fields: string[] = [],
        paramCounter = 0;

    fields.push(`[${ns}.REACTIVE_OBJECT] = true;`);

    for (let i = 0, n = properties.length; i < n; i++) {
        let { key, type, valueText } = properties[i];

        if (type === COMPILER_TYPES.Signal) {
            let param = `_v${paramCounter++}`;

            accessors.push(`get ${key}() { return ${ns}.read(this.#${key}); }`);
            accessors.push(`set ${key}(${param}) { ${ns}.write(this.#${key}, ${param}); }`);
            fields.push(`#${key} = ${ns}.signal(${valueText});`);
        }
        else if (type === COMPILER_TYPES.Array) {
            disposeStatements.push(`this.${key}.dispose();`);
            fields.push(`${key} = new ${ns}.ReactiveArray(${valueText});`);
        }
        else if (type === COMPILER_TYPES.Computed) {
            accessors.push(`get ${key}() { return ${ns}.read(this.#${key} ??= ${ns}.computed(${valueText})); }`);
            disposeStatements.push(`if (this.#${key}) ${ns}.dispose(this.#${key});`);
            fields.push(`#${key} = null;`);
        }
    }

    return `
        class ${className} {
            ${fields.join('\n')}
            ${accessors.join('\n')}

            dispose() {
                ${disposeStatements.length > 0 ? disposeStatements.join('\n') : ''}
            }
        }
    `;
}

function visit(ctx: TransformContext, node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
        ctx.lastImportEnd = node.end;

        if (
            ts.isStringLiteral(node.moduleSpecifier) &&
            node.moduleSpecifier.text.includes(PACKAGE)
        ) {
            let clause = node.importClause;

            if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
                let elements = clause.namedBindings.elements;

                for (let i = 0, n = elements.length; i < n; i++) {
                    if (elements[i].name.text === 'reactive') {
                        ctx.hasReactiveImport = true;
                        break;
                    }
                }
            }
        }
    }

    if (
        ctx.hasReactiveImport &&
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'reactive'
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


export default (sourceFile: ts.SourceFile, bindings: Bindings, ns: string): string => {
    let code = sourceFile.getFullText(),
        ctx: TransformContext = {
            bindings,
            calls: [],
            classCounter: 0,
            hasReactiveImport: false,
            lastImportEnd: 0,
            ns,
            sourceFile
        };

    visit(ctx, sourceFile);

    if (ctx.calls.length === 0) {
        return code;
    }

    let classes = ctx.calls.map(c => buildClassCode(c.className, c.properties, ns)).join('\n'),
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
            newText: ` new ${call.className}()`,
            start: call.start
        });
    }

    return c.replace(code, replacements);
};
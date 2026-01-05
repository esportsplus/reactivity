import { uid } from '@esportsplus/typescript/transformer';
import type { Bindings } from '~/types';
import { addMissingImports, applyReplacements, ExtraImport, Replacement } from './utilities';
import { ts } from '@esportsplus/typescript';


const CLASS_NAME_REGEX = /class (\w+)/;

const EXTRA_IMPORTS: ExtraImport[] = [
    { module: '@esportsplus/reactivity/constants', specifier: 'REACTIVE_OBJECT' },
    { module: '@esportsplus/reactivity/reactive/array', specifier: 'ReactiveArray' }
];


interface AnalyzedProperty {
    key: string;
    type: 'array' | 'computed' | 'signal';
    valueText: string;
}

interface ReactiveObjectCall {
    end: number;
    generatedClass: string;
    needsImports: Set<string>;
    start: number;
    varName: string | null;
}

interface TransformContext {
    allNeededImports: Set<string>;
    bindings: Bindings;
    calls: ReactiveObjectCall[];
    hasReactiveImport: boolean;
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

    let value = prop.initializer,
        valueText = value.getText(sourceFile);

    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
        return { key, type: 'computed', valueText };
    }

    if (ts.isArrayLiteralExpression(value)) {
        return { key, type: 'array', valueText };
    }

    return { key, type: 'signal', valueText };
}

function buildClassCode(className: string, properties: AnalyzedProperty[]): string {
    let accessors: string[] = [],
        disposeStatements: string[] = [],
        fields: string[] = [];

    fields.push(`[REACTIVE_OBJECT] = true;`);

    for (let i = 0, n = properties.length; i < n; i++) {
        let { key, type, valueText } = properties[i];

        if (type === 'signal') {
            let param = uid('v');

            fields.push(`#${key} = signal(${valueText});`);
            accessors.push(`get ${key}() { return read(this.#${key}); }`);
            accessors.push(`set ${key}(${param}) { set(this.#${key}, ${param}); }`);
        }
        else if (type === 'array') {
            let elements = valueText.slice(1, -1);

            fields.push(`${key} = new ReactiveArray(${elements});`);
            disposeStatements.push(`this.${key}.dispose();`);
        }
        else if (type === 'computed') {
            fields.push(`#${key}: Computed<unknown> | null = null;`);
            accessors.push(`get ${key}() { return read(this.#${key} ??= computed(${valueText})); }`);
            disposeStatements.push(`if (this.#${key}) dispose(this.#${key});`);
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
            node.moduleSpecifier.text.includes('@esportsplus/reactivity')
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
            let varName: string | null = null;

            if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
                varName = node.parent.name.text;
                ctx.bindings.set(varName, 'object');
            }

            let needsImports = new Set<string>(),
                properties: AnalyzedProperty[] = [];

            needsImports.add('REACTIVE_OBJECT');

            let props = arg.properties;

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

                if (analyzed.type === 'signal') {
                    needsImports.add('read');
                    needsImports.add('set');
                    needsImports.add('signal');
                }
                else if (analyzed.type === 'array') {
                    needsImports.add('ReactiveArray');

                    if (varName) {
                        ctx.bindings.set(`${varName}.${analyzed.key}`, 'array');
                    }
                }
                else if (analyzed.type === 'computed') {
                    needsImports.add('computed');
                    needsImports.add('dispose');
                    needsImports.add('read');
                }
            }

            needsImports.forEach(imp => ctx.allNeededImports.add(imp));

            ctx.calls.push({
                end: node.end,
                generatedClass: buildClassCode(uid('ReactiveObject'), properties),
                needsImports,
                start: node.pos,
                varName
            });
        }
    }

    ts.forEachChild(node, n => visit(ctx, n));
}


const transformReactiveObjects = (sourceFile: ts.SourceFile, bindings: Bindings): string => {
    let code = sourceFile.getFullText(),
        ctx: TransformContext = {
            allNeededImports: new Set<string>(),
            bindings,
            calls: [],
            hasReactiveImport: false,
            lastImportEnd: 0,
            sourceFile
        };

    visit(ctx, sourceFile);

    if (ctx.calls.length === 0) {
        return code;
    }

    let replacements: Replacement[] = [];

    replacements.push({
        end: ctx.lastImportEnd,
        newText: code.substring(0, ctx.lastImportEnd) + '\n' + ctx.calls.map(c => c.generatedClass).join('\n') + '\n',
        start: 0
    });

    for (let i = 0, n = ctx.calls.length; i < n; i++) {
        let call = ctx.calls[i],
            classMatch = call.generatedClass.match(CLASS_NAME_REGEX);

        replacements.push({
            end: call.end,
            newText: ` new ${classMatch ? classMatch[1] : 'ReactiveObject'}()`,
            start: call.start
        });
    }

    return addMissingImports(
        applyReplacements(code, replacements),
        ctx.allNeededImports,
        EXTRA_IMPORTS
    );
};


export { transformReactiveObjects };

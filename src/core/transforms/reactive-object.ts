import ts from 'typescript';
import type { Bindings } from '~/types';
import { addMissingImports, applyReplacements, ExtraImport, Replacement } from './utils';


let EXTRA_IMPORTS: ExtraImport[] = [
    { module: '@esportsplus/reactivity/constants', specifier: 'REACTIVE_OBJECT' },
    { module: '@esportsplus/reactivity/reactive/array', specifier: 'ReactiveArray' }
];


let classCounter = 0;


interface AnalyzedProperty {
    key: string;
    type: 'array' | 'computed' | 'signal';
    valueText: string;
}


function analyzeProperty(prop: ts.ObjectLiteralElementLike, sourceFile: ts.SourceFile): AnalyzedProperty | null {
    if (!ts.isPropertyAssignment(prop)) {
        return null;
    }

    let key: string;

    if (ts.isIdentifier(prop.name)) {
        key = prop.name.text;
    }
    else if (ts.isStringLiteral(prop.name)) {
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
            fields.push(`#${key} = signal(${valueText});`);
            accessors.push(`get ${key}() { return read(this.#${key}); }`);
            accessors.push(`set ${key}(v) { set(this.#${key}, v); }`);
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

    let disposeBody = disposeStatements.length > 0
        ? disposeStatements.join('\n        ')
        : '';

    return `class ${className} {
    ${fields.join('\n    ')}

    ${accessors.join('\n    ')}

    dispose() {
        ${disposeBody}
    }
}`;
}

interface ReactiveObjectCall {
    end: number;
    generatedClass: string;
    needsImports: Set<string>;
    start: number;
    varName: string | null;
}


const transformReactiveObjects = (
    sourceFile: ts.SourceFile,
    bindings: Bindings
): string => {
    let allNeededImports = new Set<string>(),
        calls: ReactiveObjectCall[] = [],
        code = sourceFile.getFullText(),
        hasReactiveImport = false,
        lastImportEnd = 0;

    function visit(node: ts.Node): void {
        // Track imports (always at top of file)
        if (ts.isImportDeclaration(node)) {
            lastImportEnd = node.end;

            if (ts.isStringLiteral(node.moduleSpecifier) &&
                node.moduleSpecifier.text.includes('@esportsplus/reactivity')) {

                let clause = node.importClause;

                if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
                    for (let spec of clause.namedBindings.elements) {
                        if (spec.name.text === 'reactive') {
                            hasReactiveImport = true;
                        }
                    }
                }
            }
        }

        // Process reactive() calls (only if import was found)
        if (hasReactiveImport &&
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'reactive') {

            let arg = node.arguments[0];

            if (arg && ts.isObjectLiteralExpression(arg)) {
                let varName: string | null = null;

                if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
                    varName = node.parent.name.text;
                    bindings.set(varName, 'object');
                }

                let needsImports = new Set<string>(),
                    properties: AnalyzedProperty[] = [];

                needsImports.add('REACTIVE_OBJECT');

                for (let prop of arg.properties) {
                    if (ts.isSpreadAssignment(prop)) {
                        return;
                    }

                    let analyzed = analyzeProperty(prop, sourceFile);

                    if (!analyzed) {
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
                            bindings.set(`${varName}.${analyzed.key}`, 'array');
                        }
                    }
                    else if (analyzed.type === 'computed') {
                        needsImports.add('computed');
                        needsImports.add('dispose');
                        needsImports.add('read');
                    }
                }

                for (let imp of needsImports) {
                    allNeededImports.add(imp);
                }

                calls.push({
                    end: node.end,
                    generatedClass: buildClassCode(`ReactiveObject_${(++classCounter).toString(36)}`, properties),
                    needsImports,
                    start: node.pos,
                    varName
                });
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    if (calls.length === 0) {
        return code;
    }

    let classCode = calls.map(c => c.generatedClass).join('\n\n'),
        replacements: Replacement[] = [];

    // Insert generated classes after imports
    replacements.push({
        end: lastImportEnd,
        newText: code.substring(0, lastImportEnd) + '\n\n' + classCode + '\n',
        start: 0
    });

    // Replace each reactive() call with new ClassName()
    for (let i = 0, n = calls.length; i < n; i++) {
        let call = calls[i],
            classMatch = call.generatedClass.match(/class (\w+)/),
            className = classMatch ? classMatch[1] : 'ReactiveObject';

        replacements.push({
            end: call.end,
            newText: ` new ${className}()`,
            start: call.start
        });
    }

    let result = applyReplacements(code, replacements);

    result = addMissingImports(result, allNeededImports, EXTRA_IMPORTS);

    return result;
};


export { transformReactiveObjects };

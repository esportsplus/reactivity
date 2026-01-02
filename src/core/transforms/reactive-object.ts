import ts from 'typescript';
import type { Bindings } from '~/types';


let classCounter = 0;


interface AnalyzedProperty {
    key: string;
    type: 'array' | 'computed' | 'signal';
    valueText: string;
}


function generateClassName(): string {
    return `ReactiveObject_${(++classCounter).toString(36)}`;
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

function addMissingImports(code: string, needed: Set<string>): string {
    let reactivityImportMatch = code.match(
        /(import\s*\{[^}]*\}\s*from\s*['"]@esportsplus\/reactivity['"])/
    );

    if (!reactivityImportMatch) {
        return code;
    }

    let existingImport = reactivityImportMatch[1],
        existingSpecifiers = existingImport.match(/\{([^}]*)\}/)?.[1] ?? '',
        existing = new Set(existingSpecifiers.split(',').map(s => s.trim()));

    let toAdd: string[] = [];

    for (let imp of needed) {
        if (imp !== 'ReactiveArray' && imp !== 'REACTIVE_OBJECT' && !existing.has(imp)) {
            toAdd.push(imp);
        }
    }

    if (toAdd.length > 0) {
        let newSpecifiers = [...existing, ...toAdd].filter(Boolean).sort().join(', ');
        let newImport = existingImport.replace(/\{[^}]*\}/, `{ ${newSpecifiers} }`);

        code = code.replace(existingImport, newImport);
    }

    if (needed.has('ReactiveArray') && !code.includes("from '@esportsplus/reactivity/reactive/array'")) {
        let insertPos = code.indexOf('import');

        code = code.substring(0, insertPos) +
               `import { ReactiveArray } from '@esportsplus/reactivity/reactive/array';\n` +
               code.substring(insertPos);
    }

    if (needed.has('REACTIVE_OBJECT') && !code.includes('REACTIVE_OBJECT')) {
        let insertPos = code.indexOf('import');

        code = code.substring(0, insertPos) +
               `import { REACTIVE_OBJECT } from '@esportsplus/reactivity/constants';\n` +
               code.substring(insertPos);
    }

    return code;
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

                let className = generateClassName(),
                    generatedClass = buildClassCode(className, properties);

                for (let imp of needsImports) {
                    allNeededImports.add(imp);
                }

                calls.push({
                    end: node.end,
                    generatedClass,
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

    calls.sort((a, b) => b.start - a.start);

    let result = code;

    for (let i = 0, n = calls.length; i < n; i++) {
        let call = calls[i],
            classMatch = call.generatedClass.match(/class (\w+)/),
            className = classMatch ? classMatch[1] : 'ReactiveObject';

        result = result.substring(0, call.start) +
                 ` new ${className}()` +
                 result.substring(call.end);
    }

    let classCode = calls.map(c => c.generatedClass).reverse().join('\n\n');

    result = result.substring(0, lastImportEnd) +
             '\n\n' + classCode + '\n' +
             result.substring(lastImportEnd);

    result = addMissingImports(result, allNeededImports);

    return result;
};


export { transformReactiveObjects };

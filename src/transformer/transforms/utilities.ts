import { applyReplacements, type Replacement } from '@esportsplus/typescript/transformer';
import ts from 'typescript';


type ExtraImport = {
    module: string;
    specifier: string;
};


function findReactivityImport(sourceFile: ts.SourceFile): ts.ImportDeclaration | null {
    for (let i = 0, n = sourceFile.statements.length; i < n; i++) {
        let stmt = sourceFile.statements[i];

        if (
            ts.isImportDeclaration(stmt) &&
            ts.isStringLiteral(stmt.moduleSpecifier) &&
            stmt.moduleSpecifier.text === '@esportsplus/reactivity' &&
            stmt.importClause?.namedBindings &&
            ts.isNamedImports(stmt.importClause.namedBindings)
        ) {
            return stmt;
        }
    }

    return null;
}

function getExistingSpecifiers(namedImports: ts.NamedImports): Set<string> {
    let existing = new Set<string>();

    for (let i = 0, n = namedImports.elements.length; i < n; i++) {
        let el = namedImports.elements[i],
            name = el.propertyName?.text ?? el.name.text;

        existing.add(name);
    }

    return existing;
}

function getFirstImportPos(sourceFile: ts.SourceFile): number {
    for (let i = 0, n = sourceFile.statements.length; i < n; i++) {
        if (ts.isImportDeclaration(sourceFile.statements[i])) {
            return sourceFile.statements[i].getStart(sourceFile);
        }
    }

    return 0;
}


const addMissingImports = (code: string, needed: Set<string>, extraImports?: ExtraImport[]): string => {
    let sourceFile = ts.createSourceFile('temp.ts', code, ts.ScriptTarget.Latest, true),
        reactivityImport = findReactivityImport(sourceFile);

    if (!reactivityImport) {
        return code;
    }

    let extraSpecifiers = new Set<string>(),
        namedImports = reactivityImport.importClause!.namedBindings as ts.NamedImports,
        existing = getExistingSpecifiers(namedImports),
        toAdd: string[] = [];

    if (extraImports) {
        for (let i = 0, n = extraImports.length; i < n; i++) {
            extraSpecifiers.add(extraImports[i].specifier);
        }
    }

    for (let imp of needed) {
        if (!extraSpecifiers.has(imp) && !existing.has(imp)) {
            toAdd.push(imp);
        }
    }

    if (toAdd.length > 0) {
        let combined: string[] = [];

        for (let item of existing) {
            combined.push(item);
        }

        for (let i = 0, n = toAdd.length; i < n; i++) {
            combined.push(toAdd[i]);
        }

        combined.sort();

        let newSpecifiers = `{ ${combined.join(', ')} }`,
            bindingsStart = namedImports.getStart(sourceFile),
            bindingsEnd = namedImports.getEnd();

        code = code.substring(0, bindingsStart) + newSpecifiers + code.substring(bindingsEnd);
    }

    if (extraImports) {
        let insertPos = getFirstImportPos(
            ts.createSourceFile('temp.ts', code, ts.ScriptTarget.Latest, true)
        );

        for (let i = 0, n = extraImports.length; i < n; i++) {
            let extra = extraImports[i];

            if (needed.has(extra.specifier) && !code.includes(extra.module)) {
                code = code.substring(0, insertPos) +
                       `import { ${extra.specifier} } from '${extra.module}';\n` +
                       code.substring(insertPos);
            }
        }
    }

    return code;
};


export { addMissingImports, applyReplacements };
export type { ExtraImport, Replacement };

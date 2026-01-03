import type { Replacement } from '@esportsplus/typescript/transformer';
import { applyReplacements } from '@esportsplus/typescript/transformer';


type ExtraImport = {
    module: string;
    specifier: string;
}


const BRACES_CONTENT_REGEX = /\{([^}]*)\}/;

const REACTIVITY_IMPORT_REGEX = /(import\s*\{[^}]*\}\s*from\s*['"]@esportsplus\/reactivity['"])/;


const addMissingImports = (code: string, needed: Set<string>, extraImports?: ExtraImport[]): string => {
    let reactivityImportMatch = code.match(REACTIVITY_IMPORT_REGEX);

    if (!reactivityImportMatch) {
        return code;
    }

    let bracesMatch = reactivityImportMatch[1].match(BRACES_CONTENT_REGEX),
        existing = new Set<string>(),
        existingImport = reactivityImportMatch[1],
        extraSpecifiers = new Set<string>(),
        toAdd: string[] = [];

    if (bracesMatch?.[1]) {
        let parts = bracesMatch[1].split(',');

        for (let i = 0, n = parts.length; i < n; i++) {
            let trimmed = parts[i].trim();

            if (trimmed) {
                existing.add(trimmed);
            }
        }
    }

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
            if (item) {
                combined.push(item);
            }
        }

        for (let i = 0, n = toAdd.length; i < n; i++) {
            if (toAdd[i]) {
                combined.push(toAdd[i]);
            }
        }

        combined.sort();

        code = code.replace(
            existingImport,
            existingImport.replace(BRACES_CONTENT_REGEX, `{ ${combined.join(', ')} }`)
        );
    }

    if (extraImports) {
        for (let i = 0, n = extraImports.length; i < n; i++) {
            let extra = extraImports[i];

            if (needed.has(extra.specifier) && !code.includes(extra.module)) {
                let insertPos = code.indexOf('import');

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

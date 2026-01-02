interface Replacement {
    end: number;
    newText: string;
    start: number;
}


// Apply replacements efficiently by building result in single pass
function applyReplacements(code: string, replacements: Replacement[]): string {
    if (replacements.length === 0) {
        return code;
    }

    // Sort by start position ascending for single-pass building
    replacements.sort((a, b) => a.start - b.start);

    let parts: string[] = [],
        pos = 0;

    for (let i = 0, n = replacements.length; i < n; i++) {
        let r = replacements[i];

        // Add unchanged portion before this replacement
        if (r.start > pos) {
            parts.push(code.substring(pos, r.start));
        }

        // Add replacement text
        parts.push(r.newText);
        pos = r.end;
    }

    // Add remaining unchanged portion
    if (pos < code.length) {
        parts.push(code.substring(pos));
    }

    return parts.join('');
}


interface ExtraImport {
    module: string;
    specifier: string;
}

function addMissingImports(
    code: string,
    needed: Set<string>,
    extraImports?: ExtraImport[]
): string {
    let reactivityImportMatch = code.match(
        /(import\s*\{[^}]*\}\s*from\s*['"]@esportsplus\/reactivity['"])/
    );

    if (!reactivityImportMatch) {
        return code;
    }

    let existingImport = reactivityImportMatch[1],
        existingSpecifiers = existingImport.match(/\{([^}]*)\}/)?.[1] ?? '',
        existing = new Set(existingSpecifiers.split(',').map(s => s.trim()).filter(Boolean)),
        extraSpecifiers = new Set(extraImports?.map(e => e.specifier) ?? []),
        toAdd: string[] = [];

    for (let imp of needed) {
        if (!extraSpecifiers.has(imp) && !existing.has(imp)) {
            toAdd.push(imp);
        }
    }

    if (toAdd.length > 0) {
        let newSpecifiers = [...existing, ...toAdd].filter(Boolean).sort().join(', '),
            newImport = existingImport.replace(/\{[^}]*\}/, `{ ${newSpecifiers} }`);

        code = code.replace(existingImport, newImport);
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
}


export { addMissingImports, applyReplacements };
export type { ExtraImport, Replacement };

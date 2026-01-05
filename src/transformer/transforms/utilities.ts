import { addImport, applyReplacements, type Replacement } from '@esportsplus/typescript/transformer';


type ExtraImport = {
    module: string;
    specifier: string;
};


const addMissingImports = (code: string, needed: Set<string>, extraImports?: ExtraImport[]): string => {
    let extraSpecifiers = new Set<string>(),
        reactivitySpecifiers: string[] = [];

    if (extraImports) {
        for (let i = 0, n = extraImports.length; i < n; i++) {
            extraSpecifiers.add(extraImports[i].specifier);
        }
    }

    for (let imp of needed) {
        if (!extraSpecifiers.has(imp)) {
            reactivitySpecifiers.push(imp);
        }
    }

    if (reactivitySpecifiers.length > 0) {
        code = addImport(code, '@esportsplus/reactivity', reactivitySpecifiers);
    }

    if (extraImports) {
        for (let i = 0, n = extraImports.length; i < n; i++) {
            let extra = extraImports[i];

            if (needed.has(extra.specifier)) {
                code = addImport(code, extra.module, [extra.specifier]);
            }
        }
    }

    return code;
};


export { addMissingImports, applyReplacements };
export type { ExtraImport, Replacement };

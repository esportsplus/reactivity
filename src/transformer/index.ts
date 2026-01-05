import type { Bindings } from '~/types';
import { createArrayTransformer } from './transforms/array';
import { createObjectTransformer, type GeneratedClass } from './transforms/object';
import { createPrimitivesTransformer } from './transforms/primitives';
import { mightNeedTransform } from './detector';
import { ts } from '@esportsplus/typescript';


interface ExtraImport {
    module: string;
    specifier: string;
}

const EXTRA_IMPORTS: ExtraImport[] = [
    { module: '@esportsplus/reactivity/constants', specifier: 'REACTIVE_OBJECT' },
    { module: '@esportsplus/reactivity/reactive/array', specifier: 'ReactiveArray' }
];


function addImportsTransformer(
    neededImports: Set<string>,
    extraImports: ExtraImport[]
): (context: ts.TransformationContext) => (sourceFile: ts.SourceFile) => ts.SourceFile {
    return (context: ts.TransformationContext) => {
        return (sourceFile: ts.SourceFile): ts.SourceFile => {
            if (neededImports.size === 0) {
                return sourceFile;
            }

            let extraSpecifiers = new Set<string>(),
                factory = context.factory,
                newStatements: ts.Statement[] = [],
                reactivitySpecifiers: string[] = [];

            for (let i = 0, n = extraImports.length; i < n; i++) {
                extraSpecifiers.add(extraImports[i].specifier);
            }

            for (let imp of neededImports) {
                if (!extraSpecifiers.has(imp)) {
                    reactivitySpecifiers.push(imp);
                }
            }

            // Add @esportsplus/reactivity imports
            if (reactivitySpecifiers.length > 0) {
                newStatements.push(
                    factory.createImportDeclaration(
                        undefined,
                        factory.createImportClause(
                            false,
                            undefined,
                            factory.createNamedImports(
                                reactivitySpecifiers.map(s =>
                                    factory.createImportSpecifier(false, undefined, factory.createIdentifier(s))
                                )
                            )
                        ),
                        factory.createStringLiteral('@esportsplus/reactivity')
                    )
                );
            }

            // Add extra imports (REACTIVE_OBJECT, ReactiveArray)
            for (let i = 0, n = extraImports.length; i < n; i++) {
                let extra = extraImports[i];

                if (neededImports.has(extra.specifier)) {
                    newStatements.push(
                        factory.createImportDeclaration(
                            undefined,
                            factory.createImportClause(
                                false,
                                undefined,
                                factory.createNamedImports([
                                    factory.createImportSpecifier(false, undefined, factory.createIdentifier(extra.specifier))
                                ])
                            ),
                            factory.createStringLiteral(extra.module)
                        )
                    );
                }
            }

            // Insert new imports after existing imports
            let insertIndex = 0,
                statements = sourceFile.statements;

            for (let i = 0, n = statements.length; i < n; i++) {
                if (ts.isImportDeclaration(statements[i])) {
                    insertIndex = i + 1;
                }
                else {
                    break;
                }
            }

            let updatedStatements = [
                ...statements.slice(0, insertIndex),
                ...newStatements,
                ...statements.slice(insertIndex)
            ];

            return factory.updateSourceFile(sourceFile, updatedStatements);
        };
    };
}

function insertClassesTransformer(
    generatedClasses: GeneratedClass[]
): (context: ts.TransformationContext) => (sourceFile: ts.SourceFile) => ts.SourceFile {
    return (context: ts.TransformationContext) => {
        return (sourceFile: ts.SourceFile): ts.SourceFile => {
            if (generatedClasses.length === 0) {
                return sourceFile;
            }

            let factory = context.factory;

            // Find position after imports
            let insertIndex = 0,
                statements = sourceFile.statements;

            for (let i = 0, n = statements.length; i < n; i++) {
                if (ts.isImportDeclaration(statements[i])) {
                    insertIndex = i + 1;
                }
                else {
                    break;
                }
            }

            let classDecls = generatedClasses.map(gc => gc.classDecl),
                updatedStatements = [
                    ...statements.slice(0, insertIndex),
                    ...classDecls,
                    ...statements.slice(insertIndex)
                ];

            return factory.updateSourceFile(sourceFile, updatedStatements);
        };
    };
}


const createTransformer = (): ts.TransformerFactory<ts.SourceFile> => {
    return (context: ts.TransformationContext) => {
        return (sourceFile: ts.SourceFile): ts.SourceFile => {
            let code = sourceFile.getFullText();

            if (!mightNeedTransform(code)) {
                return sourceFile;
            }

            let bindings: Bindings = new Map(),
                generatedClasses: GeneratedClass[] = [],
                neededImports = new Set<string>();

            // Run object transformer first (generates classes, tracks array bindings)
            let objectTransformer = createObjectTransformer(bindings, neededImports, generatedClasses)(context);

            sourceFile = objectTransformer(sourceFile);

            // Run array transformer (handles array.length, array[i] = v)
            let arrayTransformer = createArrayTransformer(bindings)(context);

            sourceFile = arrayTransformer(sourceFile);

            // Run primitives transformer (handles signal/computed, reads/writes)
            let primitivesTransformer = createPrimitivesTransformer(bindings, neededImports)(context);

            sourceFile = primitivesTransformer(sourceFile);

            // Insert generated classes after imports
            let classInserter = insertClassesTransformer(generatedClasses)(context);

            sourceFile = classInserter(sourceFile);

            // Add missing imports
            let importAdder = addImportsTransformer(neededImports, EXTRA_IMPORTS)(context);

            sourceFile = importAdder(sourceFile);

            return sourceFile;
        };
    };
};


export { createTransformer, mightNeedTransform };
export { createArrayTransformer } from './transforms/array';
export { createObjectTransformer } from './transforms/object';
export { createPrimitivesTransformer } from './transforms/primitives';

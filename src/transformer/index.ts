import { uid } from '@esportsplus/typescript/transformer';
import type { Bindings, Namespaces } from '~/types';
import { createArrayTransformer } from './transforms/array';
import { createObjectTransformer, type GeneratedClass } from './transforms/object';
import { createPrimitivesTransformer } from './transforms/primitives';
import { mightNeedTransform } from './detector';
import { ts } from '@esportsplus/typescript';


function addImportsTransformer(
    neededImports: Set<string>,
    ns: Namespaces
): (context: ts.TransformationContext) => (sourceFile: ts.SourceFile) => ts.SourceFile {
    return (context: ts.TransformationContext) => {
        return (sourceFile: ts.SourceFile): ts.SourceFile => {
            if (neededImports.size === 0) {
                return sourceFile;
            }

            let factory = context.factory,
                needsArray = false,
                needsConstants = false,
                needsReactivity = false,
                newStatements: ts.Statement[] = [];

            for (let imp of neededImports) {
                if (imp === 'ReactiveArray') {
                    needsArray = true;
                }
                else if (imp === 'REACTIVE_OBJECT') {
                    needsConstants = true;
                }
                else {
                    needsReactivity = true;
                }
            }

            // Add namespace imports
            if (needsReactivity) {
                newStatements.push(
                    factory.createImportDeclaration(
                        undefined,
                        factory.createImportClause(
                            false,
                            undefined,
                            factory.createNamespaceImport(factory.createIdentifier(ns.reactivity))
                        ),
                        factory.createStringLiteral('@esportsplus/reactivity')
                    )
                );
            }

            if (needsArray) {
                newStatements.push(
                    factory.createImportDeclaration(
                        undefined,
                        factory.createImportClause(
                            false,
                            undefined,
                            factory.createNamespaceImport(factory.createIdentifier(ns.array))
                        ),
                        factory.createStringLiteral('@esportsplus/reactivity/reactive/array')
                    )
                );
            }

            if (needsConstants) {
                newStatements.push(
                    factory.createImportDeclaration(
                        undefined,
                        factory.createImportClause(
                            false,
                            undefined,
                            factory.createNamespaceImport(factory.createIdentifier(ns.constants))
                        ),
                        factory.createStringLiteral('@esportsplus/reactivity/constants')
                    )
                );
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
                neededImports = new Set<string>(),
                ns: Namespaces = {
                    array: uid('ra'),
                    constants: uid('rc'),
                    reactivity: uid('r')
                };

            // Run object transformer first (generates classes, tracks array bindings)
            let objectTransformer = createObjectTransformer(bindings, neededImports, generatedClasses, ns)(context);

            sourceFile = objectTransformer(sourceFile);

            // Run array transformer (handles array.length, array[i] = v)
            let arrayTransformer = createArrayTransformer(bindings)(context);

            sourceFile = arrayTransformer(sourceFile);

            // Run primitives transformer (handles signal/computed, reads/writes)
            let primitivesTransformer = createPrimitivesTransformer(bindings, neededImports, ns)(context);

            sourceFile = primitivesTransformer(sourceFile);

            // Insert generated classes after imports
            let classInserter = insertClassesTransformer(generatedClasses)(context);

            sourceFile = classInserter(sourceFile);

            // Add namespace imports
            let importAdder = addImportsTransformer(neededImports, ns)(context);

            sourceFile = importAdder(sourceFile);

            return sourceFile;
        };
    };
};


export { createTransformer, mightNeedTransform };
export { createArrayTransformer } from './transforms/array';
export { createObjectTransformer } from './transforms/object';
export { createPrimitivesTransformer } from './transforms/primitives';

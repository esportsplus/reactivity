import { uid } from '@esportsplus/typescript/transformer';
import type { Bindings, Namespaces } from '~/types';
import { ts } from '@esportsplus/typescript';


interface AnalyzedProperty {
    elements?: ts.Expression[];
    key: string;
    type: 'array' | 'computed' | 'signal';
    value: ts.Expression;
}

interface GeneratedClass {
    classDecl: ts.ClassDeclaration;
    className: string;
    needsImports: Set<string>;
}

interface TransformContext {
    bindings: Bindings;
    context: ts.TransformationContext;
    factory: ts.NodeFactory;
    generatedClasses: GeneratedClass[];
    hasReactiveImport: boolean;
    neededImports: Set<string>;
    ns: Namespaces;
}


function analyzeProperty(prop: ts.ObjectLiteralElementLike): AnalyzedProperty | null {
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

    let value = prop.initializer;

    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
        return { key, type: 'computed', value };
    }

    if (ts.isArrayLiteralExpression(value)) {
        return { elements: [...value.elements], key, type: 'array', value };
    }

    return { key, type: 'signal', value };
}

function buildReactiveClass(
    ctx: TransformContext,
    className: string,
    properties: AnalyzedProperty[],
    varName: string | null
): ts.ClassDeclaration {
    let factory = ctx.factory,
        members: ts.ClassElement[] = [],
        needsImports = new Set<string>();

    needsImports.add('REACTIVE_OBJECT');

    // [ns.constants.REACTIVE_OBJECT] = true
    members.push(
        factory.createPropertyDeclaration(
            undefined,
            factory.createComputedPropertyName(
                factory.createPropertyAccessExpression(factory.createIdentifier(ctx.ns.constants), 'REACTIVE_OBJECT')
            ),
            undefined,
            undefined,
            factory.createTrue()
        )
    );

    let disposeStatements: ts.Statement[] = [];

    for (let i = 0, n = properties.length; i < n; i++) {
        let prop = properties[i];

        if (prop.type === 'signal') {
            needsImports.add('read');
            needsImports.add('set');
            needsImports.add('signal');

            let privateName = factory.createPrivateIdentifier(`#${prop.key}`),
                paramName = uid('v');

            // Private field: #key = ns.signal(value)
            members.push(
                factory.createPropertyDeclaration(
                    undefined,
                    privateName,
                    undefined,
                    undefined,
                    factory.createCallExpression(
                        factory.createPropertyAccessExpression(factory.createIdentifier(ctx.ns.reactivity), 'signal'),
                        undefined,
                        [prop.value]
                    )
                )
            );

            // Getter: get key() { return ns.read(this.#key); }
            members.push(
                factory.createGetAccessorDeclaration(
                    undefined,
                    factory.createIdentifier(prop.key),
                    [],
                    undefined,
                    factory.createBlock([
                        factory.createReturnStatement(
                            factory.createCallExpression(
                                factory.createPropertyAccessExpression(factory.createIdentifier(ctx.ns.reactivity), 'read'),
                                undefined,
                                [factory.createPropertyAccessExpression(factory.createThis(), privateName)]
                            )
                        )
                    ], true)
                )
            );

            // Setter: set key(v) { ns.set(this.#key, v); }
            members.push(
                factory.createSetAccessorDeclaration(
                    undefined,
                    factory.createIdentifier(prop.key),
                    [factory.createParameterDeclaration(undefined, undefined, paramName)],
                    factory.createBlock([
                        factory.createExpressionStatement(
                            factory.createCallExpression(
                                factory.createPropertyAccessExpression(factory.createIdentifier(ctx.ns.reactivity), 'set'),
                                undefined,
                                [
                                    factory.createPropertyAccessExpression(factory.createThis(), privateName),
                                    factory.createIdentifier(paramName)
                                ]
                            )
                        )
                    ], true)
                )
            );
        }
        else if (prop.type === 'array') {
            needsImports.add('ReactiveArray');

            // Public field: key = new ns.array.ReactiveArray(elements...)
            members.push(
                factory.createPropertyDeclaration(
                    undefined,
                    factory.createIdentifier(prop.key),
                    undefined,
                    undefined,
                    factory.createNewExpression(
                        factory.createPropertyAccessExpression(factory.createIdentifier(ctx.ns.array), 'ReactiveArray'),
                        undefined,
                        prop.elements || []
                    )
                )
            );

            // Track as array binding
            if (varName) {
                ctx.bindings.set(`${varName}.${prop.key}`, 'array');
            }

            // dispose: this.key.dispose()
            disposeStatements.push(
                factory.createExpressionStatement(
                    factory.createCallExpression(
                        factory.createPropertyAccessExpression(
                            factory.createPropertyAccessExpression(factory.createThis(), prop.key),
                            'dispose'
                        ),
                        undefined,
                        []
                    )
                )
            );
        }
        else if (prop.type === 'computed') {
            needsImports.add('computed');
            needsImports.add('dispose');
            needsImports.add('read');

            let privateName = factory.createPrivateIdentifier(`#${prop.key}`);

            // Private field: #key: Computed<unknown> | null = null
            members.push(
                factory.createPropertyDeclaration(
                    undefined,
                    privateName,
                    undefined,
                    factory.createUnionTypeNode([
                        factory.createTypeReferenceNode('Computed', [
                            factory.createKeywordTypeNode(ts.SyntaxKind.UnknownKeyword)
                        ]),
                        factory.createLiteralTypeNode(factory.createNull())
                    ]),
                    factory.createNull()
                )
            );

            // Getter: get key() { return ns.read(this.#key ??= ns.computed(fn)); }
            members.push(
                factory.createGetAccessorDeclaration(
                    undefined,
                    factory.createIdentifier(prop.key),
                    [],
                    undefined,
                    factory.createBlock([
                        factory.createReturnStatement(
                            factory.createCallExpression(
                                factory.createPropertyAccessExpression(factory.createIdentifier(ctx.ns.reactivity), 'read'),
                                undefined,
                                [
                                    factory.createBinaryExpression(
                                        factory.createPropertyAccessExpression(factory.createThis(), privateName),
                                        ts.SyntaxKind.QuestionQuestionEqualsToken,
                                        factory.createCallExpression(
                                            factory.createPropertyAccessExpression(factory.createIdentifier(ctx.ns.reactivity), 'computed'),
                                            undefined,
                                            [prop.value]
                                        )
                                    )
                                ]
                            )
                        )
                    ], true)
                )
            );

            // dispose: if (this.#key) ns.dispose(this.#key)
            disposeStatements.push(
                factory.createIfStatement(
                    factory.createPropertyAccessExpression(factory.createThis(), privateName),
                    factory.createExpressionStatement(
                        factory.createCallExpression(
                            factory.createPropertyAccessExpression(factory.createIdentifier(ctx.ns.reactivity), 'dispose'),
                            undefined,
                            [factory.createPropertyAccessExpression(factory.createThis(), privateName)]
                        )
                    )
                )
            );
        }
    }

    // dispose() method
    members.push(
        factory.createMethodDeclaration(
            undefined,
            undefined,
            'dispose',
            undefined,
            undefined,
            [],
            undefined,
            factory.createBlock(disposeStatements, true)
        )
    );

    // Store needed imports
    needsImports.forEach(imp => ctx.neededImports.add(imp));

    return factory.createClassDeclaration(
        undefined,
        className,
        undefined,
        undefined,
        members
    );
}

function visit(ctx: TransformContext, node: ts.Node): ts.Node | ts.Node[] {
    // Check for reactive import - return early to avoid visiting import children
    if (ts.isImportDeclaration(node)) {
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

        return node;
    }

    // Transform reactive({ ... }) or reactive([...]) calls
    if (
        ctx.hasReactiveImport &&
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'reactive'
    ) {
        let arg = node.arguments[0];

        // Handle reactive([...]) → new ns.array.ReactiveArray(...)
        if (arg && ts.isArrayLiteralExpression(arg)) {
            let varName: string | null = null;

            if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
                varName = node.parent.name.text;
                ctx.bindings.set(varName, 'array');
            }

            ctx.neededImports.add('ReactiveArray');

            return ctx.factory.createNewExpression(
                ctx.factory.createPropertyAccessExpression(ctx.factory.createIdentifier(ctx.ns.array), 'ReactiveArray'),
                undefined,
                [...arg.elements]
            );
        }

        // Handle reactive({ ... }) → new ReactiveObject class
        if (arg && ts.isObjectLiteralExpression(arg)) {
            let varName: string | null = null;

            if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
                varName = node.parent.name.text;
                ctx.bindings.set(varName, 'object');
            }

            let properties: AnalyzedProperty[] = [],
                props = arg.properties;

            for (let i = 0, n = props.length; i < n; i++) {
                let prop = props[i];

                // Bail out on spread assignments
                if (ts.isSpreadAssignment(prop)) {
                    return ts.visitEachChild(node, n => visit(ctx, n), ctx.context);
                }

                let analyzed = analyzeProperty(prop);

                if (!analyzed) {
                    return ts.visitEachChild(node, n => visit(ctx, n), ctx.context);
                }

                properties.push(analyzed);
            }

            let className = uid('ReactiveObject'),
                classDecl = buildReactiveClass(ctx, className, properties, varName);

            ctx.generatedClasses.push({
                classDecl,
                className,
                needsImports: new Set(ctx.neededImports)
            });

            // Replace reactive({...}) with new ClassName()
            return ctx.factory.createNewExpression(
                ctx.factory.createIdentifier(className),
                undefined,
                []
            );
        }
    }

    return ts.visitEachChild(node, n => visit(ctx, n), ctx.context);
}


const createObjectTransformer = (
    bindings: Bindings,
    neededImports: Set<string>,
    generatedClasses: GeneratedClass[],
    ns: Namespaces
): (context: ts.TransformationContext) => (sourceFile: ts.SourceFile) => ts.SourceFile => {
    return (context: ts.TransformationContext) => {
        return (sourceFile: ts.SourceFile): ts.SourceFile => {
            let ctx: TransformContext = {
                bindings,
                context,
                factory: context.factory,
                generatedClasses,
                hasReactiveImport: false,
                neededImports,
                ns
            };

            return ts.visitNode(sourceFile, n => visit(ctx, n)) as ts.SourceFile;
        };
    };
};


export { createObjectTransformer };
export type { GeneratedClass };

import { ts } from '@esportsplus/typescript';


// Create: ns.read(expr)
function createReadCall(factory: ts.NodeFactory, ns: string, expr: ts.Expression): ts.CallExpression {
    return factory.createCallExpression(
        factory.createPropertyAccessExpression(factory.createIdentifier(ns), 'read'),
        undefined,
        [expr]
    );
}

// Create: ns.set(target, value)
function createSetCall(factory: ts.NodeFactory, ns: string, target: ts.Expression, value: ts.Expression): ts.CallExpression {
    return factory.createCallExpression(
        factory.createPropertyAccessExpression(factory.createIdentifier(ns), 'set'),
        undefined,
        [target, value]
    );
}

// Create: ns.signal(initialValue)
function createSignalCall(factory: ts.NodeFactory, ns: string, initialValue: ts.Expression): ts.CallExpression {
    return factory.createCallExpression(
        factory.createPropertyAccessExpression(factory.createIdentifier(ns), 'signal'),
        undefined,
        [initialValue]
    );
}

// Create: ns.computed(fn)
function createComputedCall(factory: ts.NodeFactory, ns: string, fn: ts.Expression): ts.CallExpression {
    return factory.createCallExpression(
        factory.createPropertyAccessExpression(factory.createIdentifier(ns), 'computed'),
        undefined,
        [fn]
    );
}

// Create: arr.$length()
function createArrayLengthCall(factory: ts.NodeFactory, arrayExpr: ts.Expression): ts.CallExpression {
    return factory.createCallExpression(
        factory.createPropertyAccessExpression(arrayExpr, '$length'),
        undefined,
        []
    );
}

// Create: arr.$set(index, value)
function createArraySetCall(factory: ts.NodeFactory, arrayExpr: ts.Expression, index: ts.Expression, value: ts.Expression): ts.CallExpression {
    return factory.createCallExpression(
        factory.createPropertyAccessExpression(arrayExpr, '$set'),
        undefined,
        [index, value]
    );
}

// Create: new ns.ReactiveArray(elements...)
function createReactiveArrayNew(factory: ts.NodeFactory, ns: string, elements: ts.Expression[]): ts.NewExpression {
    return factory.createNewExpression(
        factory.createPropertyAccessExpression(factory.createIdentifier(ns), 'ReactiveArray'),
        undefined,
        elements
    );
}

// Create: ns.dispose(expr)
function createDisposeCall(factory: ts.NodeFactory, ns: string, expr: ts.Expression): ts.CallExpression {
    return factory.createCallExpression(
        factory.createPropertyAccessExpression(factory.createIdentifier(ns), 'dispose'),
        undefined,
        [expr]
    );
}

// Create binary expression: left op right
function createBinaryExpr(factory: ts.NodeFactory, left: ts.Expression, op: ts.BinaryOperator, right: ts.Expression): ts.BinaryExpression {
    return factory.createBinaryExpression(left, op, right);
}

// Create: (expr1, expr2) - comma expression
function createCommaExpr(factory: ts.NodeFactory, first: ts.Expression, second: ts.Expression): ts.ParenthesizedExpression {
    return factory.createParenthesizedExpression(
        factory.createBinaryExpression(first, ts.SyntaxKind.CommaToken, second)
    );
}

// Create: ((tmp) => (ns.set(name, tmp op delta), tmp))(name.value)
function createPostfixIncrementExpr(
    factory: ts.NodeFactory,
    ns: string,
    tmpName: string,
    signalName: string,
    op: ts.SyntaxKind.PlusToken | ts.SyntaxKind.MinusToken
): ts.CallExpression {
    let tmpIdent = factory.createIdentifier(tmpName),
        signalIdent = factory.createIdentifier(signalName);

    return factory.createCallExpression(
        factory.createParenthesizedExpression(
            factory.createArrowFunction(
                undefined,
                undefined,
                [factory.createParameterDeclaration(undefined, undefined, tmpIdent)],
                undefined,
                factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                createCommaExpr(
                    factory,
                    createSetCall(
                        factory,
                        ns,
                        signalIdent,
                        factory.createBinaryExpression(
                            tmpIdent,
                            op,
                            factory.createNumericLiteral(1)
                        )
                    ),
                    tmpIdent
                )
            )
        ),
        undefined,
        [factory.createPropertyAccessExpression(signalIdent, 'value')]
    );
}


export {
    createArrayLengthCall,
    createArraySetCall,
    createBinaryExpr,
    createCommaExpr,
    createComputedCall,
    createDisposeCall,
    createPostfixIncrementExpr,
    createReactiveArrayNew,
    createReadCall,
    createSetCall,
    createSignalCall
};

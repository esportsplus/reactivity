import { ts } from '@esportsplus/typescript';


// Create: read(expr)
function createReadCall(factory: ts.NodeFactory, expr: ts.Expression): ts.CallExpression {
    return factory.createCallExpression(
        factory.createIdentifier('read'),
        undefined,
        [expr]
    );
}

// Create: set(target, value)
function createSetCall(factory: ts.NodeFactory, target: ts.Expression, value: ts.Expression): ts.CallExpression {
    return factory.createCallExpression(
        factory.createIdentifier('set'),
        undefined,
        [target, value]
    );
}

// Create: signal(initialValue)
function createSignalCall(factory: ts.NodeFactory, initialValue: ts.Expression): ts.CallExpression {
    return factory.createCallExpression(
        factory.createIdentifier('signal'),
        undefined,
        [initialValue]
    );
}

// Create: computed(fn)
function createComputedCall(factory: ts.NodeFactory, fn: ts.Expression): ts.CallExpression {
    return factory.createCallExpression(
        factory.createIdentifier('computed'),
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

// Create: new ReactiveArray(elements...)
function createReactiveArrayNew(factory: ts.NodeFactory, elements: ts.Expression[]): ts.NewExpression {
    return factory.createNewExpression(
        factory.createIdentifier('ReactiveArray'),
        undefined,
        elements
    );
}

// Create: dispose(expr)
function createDisposeCall(factory: ts.NodeFactory, expr: ts.Expression): ts.CallExpression {
    return factory.createCallExpression(
        factory.createIdentifier('dispose'),
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

// Create: ((tmp) => (set(name, tmp op delta), tmp))(name.value)
function createPostfixIncrementExpr(
    factory: ts.NodeFactory,
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

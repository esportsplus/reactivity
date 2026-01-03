import type { Bindings } from '~/types';
import { applyReplacements, Replacement } from './utilities';
import ts from 'typescript';


function getPropertyPath(node: ts.PropertyAccessExpression): string | null {
    let current: ts.Node = node,
        parts: string[] = [];

    while (ts.isPropertyAccessExpression(current)) {
        parts.unshift(current.name.text);
        current = current.expression;
    }

    if (ts.isIdentifier(current)) {
        parts.unshift(current.text);
        return parts.join('.');
    }

    return null;
}

function getExpressionName(node: ts.Expression): string | null {
    if (ts.isIdentifier(node)) {
        return node.text;
    }

    if (ts.isPropertyAccessExpression(node)) {
        return getPropertyPath(node);
    }

    return null;
}

function isAssignmentTarget(node: ts.Node): boolean {
    let parent = node.parent;

    if (
        (ts.isBinaryExpression(parent) && parent.left === node) ||
        ts.isPostfixUnaryExpression(parent) ||
        ts.isPrefixUnaryExpression(parent)
    ) {
        return true;
    }

    return false;
}


const transformReactiveArrays = (
    sourceFile: ts.SourceFile,
    bindings: Bindings
): string => {
    let code = sourceFile.getFullText(),
        replacements: Replacement[] = [];

    // Single-pass visitor: collect bindings and find replacements together
    function visit(node: ts.Node): void {
        // Collect array bindings from variable declarations
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
            if (ts.isIdentifier(node.initializer) && bindings.get(node.initializer.text) === 'array') {
                bindings.set(node.name.text, 'array');
            }

            if (ts.isPropertyAccessExpression(node.initializer)) {
                let path = getPropertyPath(node.initializer);

                if (path && bindings.get(path) === 'array') {
                    bindings.set(node.name.text, 'array');
                }
            }
        }

        // Collect array bindings from function parameters
        if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) && node.parameters) {
            for (let i = 0, n = node.parameters.length; i < n; i++) {
                let param = node.parameters[i];

                if (
                    (ts.isIdentifier(param.name) && param.type) &&
                    ts.isTypeReferenceNode(param.type) &&
                    ts.isIdentifier(param.type.typeName) &&
                    param.type.typeName.text === 'ReactiveArray'
                ) {
                    bindings.set(param.name.text, 'array');
                }
            }
        }

        // Find .length access replacements
        if (
            ts.isPropertyAccessExpression(node) &&
            node.name.text === 'length' &&
            !isAssignmentTarget(node)
        ) {
            let objName = getExpressionName(node.expression);

            if (objName && bindings.get(objName) === 'array') {
                let objText = node.expression.getText(sourceFile);

                replacements.push({
                    end: node.end,
                    newText: `${objText}.$length()`,
                    start: node.pos
                });
            }
        }

        // Find array[i] = value replacements
        if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isElementAccessExpression(node.left)
        ) {
            let elemAccess = node.left,
                objName = getExpressionName(elemAccess.expression);

            if (objName && bindings.get(objName) === 'array') {
                let indexText = elemAccess.argumentExpression.getText(sourceFile),
                    objText = elemAccess.expression.getText(sourceFile),
                    valueText = node.right.getText(sourceFile);

                replacements.push({
                    end: node.end,
                    newText: `${objText}.$set(${indexText}, ${valueText})`,
                    start: node.pos
                });
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    return applyReplacements(code, replacements);
};


export { transformReactiveArrays };

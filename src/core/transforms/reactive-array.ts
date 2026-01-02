import ts from 'typescript';
import type { Bindings } from '~/types';


interface Replacement {
    end: number;
    newText: string;
    start: number;
}


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

    if (ts.isBinaryExpression(parent) && parent.left === node) {
        return true;
    }

    if (ts.isPostfixUnaryExpression(parent) || ts.isPrefixUnaryExpression(parent)) {
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

    function collectBindings(node: ts.Node): void {
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

        if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) && node.parameters) {
            for (let param of node.parameters) {
                if (ts.isIdentifier(param.name) && param.type) {
                    if (ts.isTypeReferenceNode(param.type) &&
                        ts.isIdentifier(param.type.typeName) &&
                        param.type.typeName.text === 'ReactiveArray') {
                        bindings.set(param.name.text, 'array');
                    }
                }
            }
        }

        ts.forEachChild(node, collectBindings);
    }

    collectBindings(sourceFile);

    function findReplacements(node: ts.Node): void {
        if (ts.isPropertyAccessExpression(node) &&
            node.name.text === 'length' &&
            !isAssignmentTarget(node)) {

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

        if (ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isElementAccessExpression(node.left)) {

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

        ts.forEachChild(node, findReplacements);
    }

    findReplacements(sourceFile);

    if (replacements.length === 0) {
        return code;
    }

    replacements.sort((a, b) => b.start - a.start);

    let result = code;

    for (let i = 0, n = replacements.length; i < n; i++) {
        let r = replacements[i];

        result = result.substring(0, r.start) + r.newText + result.substring(r.end);
    }

    return result;
};


export { transformReactiveArrays };

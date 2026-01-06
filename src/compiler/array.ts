import { ts } from '@esportsplus/typescript';
import { ast, code as c, imports, type Replacement } from '@esportsplus/typescript/compiler';
import { COMPILER_ENTRYPOINT, COMPILER_TYPES, PACKAGE } from '~/constants';
import type { AliasKey, Aliases, Bindings } from '~/types';


interface TransformContext {
    aliases: Aliases;
    bindings: Bindings;
    checker?: ts.TypeChecker;
    replacements: Replacement[];
    sourceFile: ts.SourceFile;
    used: Set<AliasKey>;
}


function isReactiveCall(node: ts.CallExpression, checker?: ts.TypeChecker): boolean {
    if (!ts.isIdentifier(node.expression)) {
        return false;
    }

    if (node.expression.text !== COMPILER_ENTRYPOINT) {
        return false;
    }

    return imports.isFromPackage(node.expression, PACKAGE, checker);
}

function visit(ctx: TransformContext, node: ts.Node): void {
    if (ts.isCallExpression(node) && isReactiveCall(node, ctx.checker) && node.arguments.length > 0) {
        let arg = node.arguments[0];

        if (ts.isArrayLiteralExpression(arg)) {
            let varName: string | null = null;

            if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
                varName = node.parent.name.text;
                ctx.bindings.set(varName, COMPILER_TYPES.Array);
            }

            ctx.used.add('ReactiveArray');
            ctx.replacements.push({
                end: node.end,
                newText: arg.elements.length > 0
                    ? ` new ${ctx.aliases.ReactiveArray}(...${arg.getText(ctx.sourceFile)})`
                    : ` new ${ctx.aliases.ReactiveArray}()`,
                start: node.pos
            });
        }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (ts.isIdentifier(node.initializer) && ctx.bindings.get(node.initializer.text) === COMPILER_TYPES.Array) {
            ctx.bindings.set(node.name.text, COMPILER_TYPES.Array);
        }

        if (ts.isPropertyAccessExpression(node.initializer)) {
            let path = ast.getPropertyPathString(node.initializer);

            if (path && ctx.bindings.get(path) === COMPILER_TYPES.Array) {
                ctx.bindings.set(node.name.text, COMPILER_TYPES.Array);
            }
        }
    }

    if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node)) && node.parameters) {
        for (let i = 0, n = node.parameters.length; i < n; i++) {
            let param = node.parameters[i];

            if (
                (ts.isIdentifier(param.name) && param.type) &&
                ts.isTypeReferenceNode(param.type) &&
                ts.isIdentifier(param.type.typeName) &&
                param.type.typeName.text === 'ReactiveArray'
            ) {
                ctx.bindings.set(param.name.text, COMPILER_TYPES.Array);
            }
        }
    }

    let parent = node.parent;

    if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === 'length' &&
        (!!parent && (
            (ts.isBinaryExpression(parent) && parent.left === node) ||
            ts.isPostfixUnaryExpression(parent) ||
            ts.isPrefixUnaryExpression(parent)
        )) === false
    ) {
        let name = ast.getExpressionName(node.expression);

        if (name && ctx.bindings.get(name) === COMPILER_TYPES.Array) {
            ctx.replacements.push({
                end: node.end,
                newText: `${node.expression.getText(ctx.sourceFile)}.$length()`,
                start: node.pos
            });
        }
    }

    if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isElementAccessExpression(node.left)
    ) {
        let elemAccess = node.left,
            objName = ast.getExpressionName(elemAccess.expression);

        if (objName && ctx.bindings.get(objName) === COMPILER_TYPES.Array) {
            let index = elemAccess.argumentExpression.getText(ctx.sourceFile),
                obj = elemAccess.expression.getText(ctx.sourceFile),
                value = node.right.getText(ctx.sourceFile);

            ctx.replacements.push({
                end: node.end,
                newText: `${obj}.$set(${index}, ${value})`,
                start: node.pos
            });
        }
    }

    ts.forEachChild(node, n => visit(ctx, n));
}


export default (sourceFile: ts.SourceFile, bindings: Bindings, aliases: Aliases, used: Set<AliasKey>, checker?: ts.TypeChecker): string => {
    let code = sourceFile.getFullText(),
        ctx: TransformContext = {
            aliases,
            bindings,
            checker,
            replacements: [],
            sourceFile,
            used
        };

    visit(ctx, sourceFile);

    if (ctx.replacements.length === 0) {
        return code;
    }

    return c.replace(code, ctx.replacements);
};
import { ts } from '@esportsplus/typescript';
import { TYPES } from './constants';
import type { Bindings } from './types';


function root(expression: ts.Expression): { path: string; root: ts.Identifier } | null {
    let parts: string[] = [];

    while (ts.isPropertyAccessExpression(expression)) {
        parts.push(expression.name.text);
        expression = expression.expression;
    }

    if (!ts.isIdentifier(expression) || parts.length === 0) {
        return null;
    }

    return { path: parts.reverse().join('.'), root: expression };
}

function symbolOf(bindings: Bindings, identifier: ts.Identifier): ts.Symbol | undefined {
    let parent = identifier.parent;

    // A shorthand property's own symbol is the object property, not the variable it reads
    if (parent && ts.isShorthandPropertyAssignment(parent) && parent.name === identifier) {
        return bindings.checker.getShorthandAssignmentValueSymbol(parent);
    }

    return bindings.checker.getSymbolAtLocation(identifier);
}


// Bindings are keyed by symbol, so a shadowing local, parameter or property that merely shares a
// reactive variable's name is never rewritten. `names` keeps resolution cheap: an identifier whose
// text no reactive declaration uses cannot refer to one, so it never costs a checker round-trip.
const create = (checker: ts.Checker): Bindings => ({
    checker,
    names: new Set(),
    paths: new Map(),
    symbols: new Map()
});

const declare = (bindings: Bindings, identifier: ts.Identifier, type: TYPES): void => {
    let symbol = bindings.checker.getSymbolAtLocation(identifier);

    if (symbol) {
        bindings.names.add(identifier.text);
        bindings.symbols.set(symbol, type);
    }
};

// `state.items` where `state` is a reactive object whose `items` property is a ReactiveArray
const declarePath = (bindings: Bindings, identifier: ts.Identifier, path: string): void => {
    let symbol = bindings.checker.getSymbolAtLocation(identifier);

    if (!symbol) {
        return;
    }

    let paths = bindings.paths.get(symbol);

    if (!paths) {
        paths = new Set();
        bindings.paths.set(symbol, paths);
    }

    bindings.names.add(identifier.text);
    paths.add(path);
};

// True for an identifier or property path that denotes a ReactiveArray binding
const isArray = (bindings: Bindings, expression: ts.Expression): boolean => {
    if (ts.isIdentifier(expression)) {
        return resolve(bindings, expression)?.type === TYPES.Array;
    }

    let access = root(expression);

    if (!access || !bindings.names.has(access.root.text)) {
        return false;
    }

    let symbol = symbolOf(bindings, access.root);

    return symbol !== undefined && bindings.paths.get(symbol)?.has(access.path) === true;
};

const resolve = (bindings: Bindings, identifier: ts.Identifier): { symbol: ts.Symbol; type: TYPES } | null => {
    if (!bindings.names.has(identifier.text)) {
        return null;
    }

    let symbol = symbolOf(bindings, identifier),
        type = symbol && bindings.symbols.get(symbol);

    return symbol && type !== undefined ? { symbol, type } : null;
};


export default { create, declare, declarePath, isArray, resolve };

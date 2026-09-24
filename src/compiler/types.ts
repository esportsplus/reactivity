import type { ts } from '@esportsplus/typescript';
import type { TYPES } from './constants';


type Bindings = {
    checker: ts.Checker;
    names: Set<string>;
    paths: Map<ts.Symbol, Set<string>>;
    symbols: Map<ts.Symbol, TYPES>;
};

type IsReactiveCall = (node: ts.Node) => node is ts.CallExpression;


export type { Bindings, IsReactiveCall };

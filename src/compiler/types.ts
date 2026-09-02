import type { ts } from '@esportsplus/typescript';
import { TYPES } from './constants';


type Bindings = Map<string, TYPES>;

type IsReactiveCall = (node: ts.Node) => node is ts.CallExpression;


export type { Bindings, IsReactiveCall };

import type { ts } from '@esportsplus/typescript';
import type { Origin } from '@esportsplus/typescript/compiler';


// What a file is compiled against: its values resolved to their declarations, and the
// declarations `reactive` resolves to (one per installed copy of the package)
type Bindings = {
    checker: ts.Checker;
    entries: Set<string>;
    origins: Map<ts.Node, Origin>;
    program: ts.Program;
    sourceFile: ts.SourceFile;
};

type IsReactiveCall = (node: ts.Node) => node is ts.CallExpression;


export type { Bindings, IsReactiveCall };

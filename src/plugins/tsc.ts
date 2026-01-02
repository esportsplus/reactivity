import ts from 'typescript';
import { createTransformer } from '~/core';


// TypeScript custom transformers API requires program parameter, but we don't use it
const transformer = (_program: ts.Program): ts.TransformerFactory<ts.SourceFile> => {
    return createTransformer();
};


export default transformer;

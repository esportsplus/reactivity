import ts from 'typescript';
import { createTransformer } from '~/core';


const transformer = (program: ts.Program): ts.TransformerFactory<ts.SourceFile> => {
    return createTransformer(program);
};


export default transformer;

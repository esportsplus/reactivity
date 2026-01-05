import { createTransformer } from '~/transformer';
import { ts } from '@esportsplus/typescript';


// TypeScript custom transformers API requires program parameter, but we don't use it
export default (_program: ts.Program): ts.TransformerFactory<ts.SourceFile> => {
    return createTransformer();
};

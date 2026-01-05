import { transform } from '~/transformer';
import { ts } from '@esportsplus/typescript';


// TypeScript custom transformers API requires program parameter, but we don't use it
export default (_program: ts.Program): ts.TransformerFactory<ts.SourceFile> => {
    return () => {
        return (sourceFile: ts.SourceFile): ts.SourceFile => {
            let result = transform(sourceFile);

            return result.transformed ? result.sourceFile : sourceFile;
        };
    };
};

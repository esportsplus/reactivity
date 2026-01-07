import { plugin } from '@esportsplus/typescript/compiler';
import { analyze, transform } from '..';


export default plugin.tsc({ analyze, transform }) as ReturnType<typeof plugin.tsc>;

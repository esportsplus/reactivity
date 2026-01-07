import { PACKAGE } from '../../constants';
import { plugin } from '@esportsplus/typescript/compiler';
import { analyze, transform } from '..';


export default plugin.vite({
    analyze,
    name: PACKAGE,
    transform
});
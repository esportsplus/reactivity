import { PACKAGE } from '../../constants';
import { plugin } from '@esportsplus/typescript/compiler';
import { transform } from '..';


export default plugin.vite({
    name: PACKAGE,
    transform
});
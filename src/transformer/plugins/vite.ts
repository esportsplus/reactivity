import { PACKAGE } from '../../constants';
import { plugin } from '@esportsplus/typescript/transformer';
import { transform } from '..';


export default plugin.vite({
    name: PACKAGE,
    transform
});
import { plugin } from '@esportsplus/typescript/compiler';
import { PACKAGE } from '../constants';
import reactivity from '..';


export default plugin.vite({
    name: PACKAGE,
    plugins: [reactivity]
});

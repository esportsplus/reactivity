import { effect } from '~/signal';
import context from '~/context';


export default (...args: Parameters<typeof effect>) => context.node({}, effect(...args));
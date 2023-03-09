import { assign } from '~/context';
import { effect } from '~/core';
import { Options } from '~/types';


export default (fn: Parameters<typeof effect>[0], options: Options = {}) => {
    return assign({}, effect(fn, options));
};
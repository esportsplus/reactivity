import { dispatch } from '~/core';
import { NODE, NODES } from '~/symbols';
import { Wrapper } from '~/types';


export default (key: symbol, wrapper: Wrapper) => {
    if (wrapper[NODE]) {
        dispatch(key, wrapper[NODE]);
    }
    else if (wrapper[NODES]) {
        let nodes = wrapper[NODES];

        for (let i = 0, n = nodes.length; i < n; i++) {
            dispatch(key, nodes[i]);
        }
    }
};
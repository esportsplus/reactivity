import { reset } from '~/core';
import { NODE, NODES } from '~/symbols';
import { Wrapper } from '~/types';


export default (wrapper: Wrapper) => {
    if (wrapper[NODE]) {
        reset(wrapper[NODE]);
    }
    else if (wrapper[NODES]) {
        let nodes = wrapper[NODES];

        for (let i = 0, n = nodes.length; i < n; i++) {
            reset(nodes[i]);
        }
    }
};
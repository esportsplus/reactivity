import { dispose } from '~/core';
import { NODE, NODES } from '~/symbols';
import { Wrapper } from '~/types';


export default (wrapper: Wrapper) => {
    if (wrapper[NODE]) {
        dispose(wrapper[NODE]);
    }
    else if (wrapper[NODES]) {
        let nodes = wrapper[NODES];

        for (let i = 0, n = nodes.length; i < n; i++) {
            dispose(nodes[i]);
        }
    }
};
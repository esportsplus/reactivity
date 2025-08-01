import { STATE_DIRTY, STATE_NONE } from './constants';
import { computed, dispose, read, signal, stabilize } from './signal';
import { Computed } from './types';


let c: Computed<void> | null = null;


const scheduler = (schedule: (task: VoidFunction) => void) => {
    if (c) {
        dispose(c);
    }

    c = computed(() => {
        if (read(state) !== STATE_DIRTY) {
            return;
        }

        schedule(stabilize);
    });
};

const state = signal(STATE_NONE);


export default scheduler;
export { state };
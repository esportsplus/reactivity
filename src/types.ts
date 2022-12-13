import { CLEAN, CHECK, DIRTY } from './symbols';


type Queue = {
    add: (fn: () => Promise<void> | void) => void;
};

type State = typeof CHECK | typeof CLEAN | typeof DIRTY;


export { Queue, State };
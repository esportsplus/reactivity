import { CLEAN, CHECK, DIRTY } from './symbols';


type State = typeof CHECK | typeof CLEAN | typeof DIRTY;


export { State };
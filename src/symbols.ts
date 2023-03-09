const CLEAN = 0;

const CHECK = 1;

const DIRTY = 2;

const DISPOSED = 3;


const COMPUTED = 0;

const EFFECT = 1;

const SIGNAL = 2;


const DISPOSE = Symbol();

const RESET = Symbol();

const UPDATE = Symbol();


export { CHECK, CLEAN, COMPUTED, DIRTY, DISPOSED, DISPOSE, EFFECT, RESET, SIGNAL, UPDATE };
const REACTIVE = Symbol('reactive');

const STATE_NONE = 0;

const STATE_CHECK = 1 << 0;

const STATE_DIRTY = 1 << 1;

const STATE_RECOMPUTING = 1 << 2;

const STATE_IN_HEAP = 1 << 3;


export {
    REACTIVE,
    STATE_CHECK,
    STATE_DIRTY,
    STATE_IN_HEAP,
    STATE_NONE,
    STATE_RECOMPUTING
};
const COMPUTED = Symbol('computed');

const REACTIVE_ARRAY = Symbol('reactive.array');

const REACTIVE_OBJECT = Symbol('reactive.object');

const SIGNAL = Symbol('signal');


const STABILIZER_IDLE = 0;

const STABILIZER_RESCHEDULE = 1;

const STABILIZER_RUNNING = 2;

const STABILIZER_SCHEDULED = 3;


const STATE_NONE = 0;

const STATE_CHECK = 1 << 0;

const STATE_DIRTY = 1 << 1;

const STATE_RECOMPUTING = 1 << 2;

const STATE_IN_HEAP = 1 << 3;


export {
    COMPUTED,
    REACTIVE_ARRAY,
    REACTIVE_OBJECT,
    SIGNAL,
    STABILIZER_IDLE,
    STABILIZER_RESCHEDULE,
    STABILIZER_RUNNING,
    STABILIZER_SCHEDULED,
    STATE_CHECK,
    STATE_DIRTY,
    STATE_IN_HEAP,
    STATE_NONE,
    STATE_RECOMPUTING
};
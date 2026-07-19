import { computed, effect, read, root, signal, write } from '~/system';


interface ReactiveComputed<T> {
    read: () => T;
}

interface ReactiveSignal<T> extends ReactiveComputed<T> {
    write: (value: T) => void;
}


// Mirrors js-reactivity-benchmark's ReactiveFramework so a future external-package swap is mechanical
const framework = {
    computed: <T>(fn: () => T): ReactiveComputed<T> => {
        let node = computed(fn);

        return {
            read: () => read(node)
        };
    },
    effect: (fn: () => void): VoidFunction => effect(fn),
    signal: <T>(value: T): ReactiveSignal<T> => {
        let node = signal(value);

        return {
            read: () => read(node),
            write: (v: T) => write(node, v)
        };
    },
    withBatch: async (fn: () => void): Promise<void> => {
        fn();

        // Propagation is microtask-scheduled (schedule/stabilize) — two ticks cover a reschedule
        await Promise.resolve();
        await Promise.resolve();
    },
    withBuild: <T>(fn: () => T): T => root(fn)
};

const assert = (condition: boolean, message: string): void => {
    if (!condition) {
        throw new Error(`bench: ${message}`);
    }
};


export { assert, framework };
export type { ReactiveComputed, ReactiveSignal };

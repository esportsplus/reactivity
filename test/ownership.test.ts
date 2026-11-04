import { describe, expect, it } from 'vitest';
import { computed, owner as current, dispose, effect, flush, onCleanup, read, root, signal, untrack, write } from '~/system';
import type { Computed } from '~/system';
import { captureUncaught } from './lib/uncaught';


// User cleanups plus owned children still registered on a node; also asserts the owned list's
// back-pointers, the head's tail pointer, and each child's owner stay consistent.
function registrations(node: Computed<unknown>): number {
    let n = node.cleanup === null ? 0 : typeof node.cleanup === 'function' ? 1 : node.cleanup.length,
        prev: Computed<unknown> | null = null;

    for (let child = node.owned; child; child = child.nextOwned) {
        expect(child.owner).toBe(node);

        if (prev !== null) {
            expect(child.prevOwned).toBe(prev);
        }

        prev = child;
        n++;
    }

    if (node.owned) {
        expect(node.owned.prevOwned).toBe(prev);
    }

    return n;
}

// A computed is the only owner whose node the public API hands back, so tests own through one,
// and settles the children it defers (any child after the first is queued, not run inline).
function owner(fn: () => void): Computed<unknown> {
    let node = computed(() => {
            fn();
            return 0;
        }) as Computed<unknown>;

    flush();

    return node;
}


describe('ownership unlink', () => {
    it('child root disposed early unlinks from its owner', () => {
        let disposers: VoidFunction[] = [],
            log: string[] = [],
            parent = owner(() => {
                for (let i = 0; i < 3; i++) {
                    root((d) => {
                        onCleanup(() => { log.push(`r${i}`); });
                        disposers.push(d);
                    });
                }
            });

        expect(registrations(parent)).toBe(3);

        disposers[1]();
        expect(log).toEqual(['r1']);
        expect(registrations(parent)).toBe(2);

        disposers[2]();
        expect(registrations(parent)).toBe(1);

        disposers[0]();
        expect(registrations(parent)).toBe(0);
        expect(parent.owned).toBe(null);

        dispose(parent);
        expect(log).toEqual(['r1', 'r2', 'r0']);
    });

    it('child effect disposed early unlinks from its owner', () => {
        let runs = 0,
            stops: Computed<unknown>[] = [],
            parent = owner(() => {
                for (let i = 0; i < 3; i++) {
                    stops.push(effect(() => {
                        onCleanup(() => { runs++; });
                    }));
                }
            });

        expect(registrations(parent)).toBe(3);

        dispose(stops[0]);
        expect(registrations(parent)).toBe(2);
        expect(parent.owned!.owner).toBe(parent);

        dispose(stops[2]);
        dispose(stops[1]);
        expect(registrations(parent)).toBe(0);

        dispose(parent);
        expect(runs).toBe(3);
    });

    it('child computed disposed early unlinks from its owner', () => {
        let child: Computed<unknown> | null = null,
            parent = owner(() => {
                child = computed(() => 1) as Computed<unknown>;
            });

        expect(child!.owner).toBe(parent);
        expect(registrations(parent)).toBe(1);

        dispose(child!);
        expect(child!.owner).toBe(null);
        expect(registrations(parent)).toBe(0);
    });

    it('a root inside a root is owned by the outer scope', () => {
        let inner = 0;

        root((d) => {
            root((_) => {
                onCleanup(() => { inner++; });
            });

            d();
        });

        expect(inner).toBe(1);
    });

    it('user cleanups registered alongside children stay on the cleanup slot', () => {
        let parent = owner(() => {
                onCleanup(() => {});
                effect(() => {});
                onCleanup(() => {});
            });

        expect(typeof parent.cleanup === 'function' ? 1 : parent.cleanup!.length).toBe(2);
        expect(registrations(parent)).toBe(3);
    });
});


describe('ownership churn', () => {
    it('10k child roots created + disposed leave no registrations behind', () => {
        let parent = owner(() => {
                for (let i = 0; i < 10000; i++) {
                    root((d) => {
                        onCleanup(() => {});
                        d();
                    });
                }
            });

        expect(registrations(parent)).toBe(0);
    });

    it('10k child effects created + disposed leave no registrations behind', () => {
        let parent = owner(() => {
                for (let i = 0; i < 10000; i++) {
                    dispose(effect(() => {
                        onCleanup(() => {});
                    }));
                }
            });

        expect(registrations(parent)).toBe(0);
    });

    it('registrations stay bounded by the live children under push/remove churn', () => {
        let live: VoidFunction[] = [],
            max = 0,
            parent = owner(() => {
                for (let i = 0; i < 10000; i++) {
                    root((d) => {
                        live.push(d);
                    });

                    if (live.length > 8) {
                        live.splice(i % live.length, 1)[0]();
                    }

                    max = Math.max(max, registrations(parent!));
                }
            });

        expect(max).toBeLessThanOrEqual(9);
        expect(registrations(parent)).toBe(live.length);
    });

    it('re-runs do not accumulate registrations', () => {
        let s = signal(0),
            node: Computed<unknown> | null = null;

        node = computed(() => {
            read(s);
            onCleanup(() => {});
            effect(() => {});
            root((_) => {});
            return 0;
        }) as Computed<unknown>;

        for (let i = 1; i <= 100; i++) {
            write(s, i);
            flush();
        }

        expect(registrations(node)).toBe(3);
    });
});


describe('ownership ordering', () => {
    it('re-run interleaves user cleanups and child disposal in registration order', () => {
        let log: string[] = [],
            s = signal(0);

        effect(() => {
            if (read(s) === 0) {
                onCleanup(() => { log.push('a'); });
                effect(() => {
                    onCleanup(() => { log.push('effect'); });
                });
                onCleanup(() => { log.push('b'); });
                root((_) => {
                    onCleanup(() => { log.push('root'); });
                });
                computed(() => {
                    onCleanup(() => { log.push('computed'); });
                    return 0;
                });
                onCleanup(() => { log.push('c'); });
            }
        });

        flush();
        write(s, 1);
        flush();

        expect(log).toEqual(['a', 'effect', 'b', 'root', 'computed', 'c']);
    });

    it('dispose runs user cleanups FIFO, then children newest-first', () => {
        let log: string[] = [];

        root((d) => {
            onCleanup(() => { log.push('a'); });
            effect(() => {
                onCleanup(() => { log.push('e1'); });
                effect(() => {
                    onCleanup(() => { log.push('e1.1'); });
                });
            });
            onCleanup(() => { log.push('b'); });
            root((_) => {
                onCleanup(() => { log.push('r1'); });
            });
            effect(() => {
                onCleanup(() => { log.push('e2'); });
            });
            onCleanup(() => { log.push('c'); });

            d();
        });

        expect(log).toEqual(['a', 'b', 'c', 'e2', 'r1', 'e1', 'e1.1']);
    });

    it('an early-disposed child leaves the remaining order intact', () => {
        let log: string[] = [],
            s = signal(0),
            stop: Computed<unknown> | null = null;

        effect(() => {
            if (read(s) === 0) {
                onCleanup(() => { log.push('a'); });
                effect(() => {
                    onCleanup(() => { log.push('x'); });
                });
                stop = effect(() => {
                    onCleanup(() => { log.push('y'); });
                });
                onCleanup(() => { log.push('b'); });
                effect(() => {
                    onCleanup(() => { log.push('z'); });
                });
            }
        });

        flush();
        dispose(stop!);
        expect(log).toEqual(['y']);

        write(s, 1);
        flush();

        expect(log).toEqual(['y', 'a', 'x', 'b', 'z']);
    });

    it('cleanups registered during a run fire before the next run', () => {
        let log: string[] = [],
            s = signal(0);

        effect(() => {
            let v = read(s);

            log.push(`run${v}`);
            onCleanup(() => { log.push(`cleanup${v}`); });
            effect(() => {
                onCleanup(() => { log.push(`child${v}`); });
            });
        });

        flush();
        write(s, 1);
        flush();
        write(s, 2);
        flush();

        expect(log).toEqual(['run0', 'cleanup0', 'child0', 'run1', 'cleanup1', 'child1', 'run2']);
    });
});


describe('ownership double dispose', () => {
    it('disposing a child twice is a no-op and leaves siblings registered', () => {
        let runs = 0,
            stop: Computed<unknown> | null = null,
            parent = owner(() => {
                effect(() => {});
                stop = effect(() => {
                    onCleanup(() => { runs++; });
                });
                effect(() => {});
            });

        dispose(stop!);
        dispose(stop!);

        expect(runs).toBe(1);
        expect(registrations(parent)).toBe(2);

        dispose(parent);
        dispose(parent);

        expect(runs).toBe(1);
        expect(registrations(parent)).toBe(0);
    });

    it('a root disposer called twice runs its cleanups once', () => {
        let d: VoidFunction | null = null,
            runs = 0;

        root((dispose) => {
            onCleanup(() => { runs++; });
            d = dispose;
        });

        d!();
        d!();

        expect(runs).toBe(1);
    });
});


describe('ownership dispose mid-drain', () => {
    it('a child cleanup disposing its parent and a sibling runs every cleanup once', () => {
        let counts = { a: 0, b: 0, c: 0, parent: 0 },
            stopB: Computed<unknown> | null = null,
            stopParent: VoidFunction | null = null;

        root((d) => {
            stopParent = d;
            onCleanup(() => { counts.parent++; });
            effect(() => {
                onCleanup(() => {
                    counts.a++;
                    dispose(stopB!);
                    stopParent!();
                });
            });
            stopB = effect(() => {
                onCleanup(() => { counts.b++; });
            });
            effect(() => {
                onCleanup(() => { counts.c++; });
            });
        });

        stopParent!();

        expect(counts).toEqual({ a: 1, b: 1, c: 1, parent: 1 });
    });

    it('a child disposing its parent from its own cleanup unlinks first', () => {
        let counts = { child: 0, parent: 0, sibling: 0 },
            parent: Computed<unknown> | null = null,
            stop: Computed<unknown> | null = null;

        parent = owner(() => {
            onCleanup(() => { counts.parent++; });
            stop = effect(() => {
                onCleanup(() => {
                    counts.child++;
                    dispose(parent!);
                });
            });
            effect(() => {
                onCleanup(() => { counts.sibling++; });
            });
        });

        dispose(stop!);

        expect(counts).toEqual({ child: 1, parent: 1, sibling: 1 });
        expect(registrations(parent)).toBe(0);
    });

    it('a re-run where one child disposes a later sibling skips it', () => {
        let log: string[] = [],
            s = signal(0),
            stopY: Computed<unknown> | null = null;

        effect(() => {
            if (read(s) === 0) {
                effect(() => {
                    onCleanup(() => {
                        log.push('x');
                        dispose(stopY!);
                    });
                });
                stopY = effect(() => {
                    onCleanup(() => { log.push('y'); });
                });
                effect(() => {
                    onCleanup(() => { log.push('z'); });
                });
            }
        });

        flush();
        write(s, 1);
        flush();

        expect(log).toEqual(['x', 'y', 'z']);
    });

    it('deep owner trees dispose in one drain', () => {
        let count = 0;

        root((d) => {
            let nest = (n: number): void => {
                if (n === 0) {
                    return;
                }

                root((_) => {
                    onCleanup(() => { count++; });
                    nest(n - 1);
                });
            };

            for (let i = 0; i < 10; i++) {
                nest(1000);
            }

            d();
        });

        expect(count).toBe(10000);
    });
});


describe('ownership throwing cleanup', () => {
    it('a throwing child cleanup rethrows to the dispose caller after every node is disposed', () => {
        let counts = { a: 0, c: 0, parent: 0 },
            d: VoidFunction | null = null,
            error = new Error('child boom');

        root((dispose) => {
            d = dispose;
            onCleanup(() => { counts.parent++; });
            effect(() => {
                onCleanup(() => { counts.a++; });
            });
            effect(() => {
                onCleanup(() => { throw error; });
            });
            effect(() => {
                onCleanup(() => { counts.c++; });
            });
        });

        expect(() => d!()).toThrow(error);
        expect(counts).toEqual({ a: 1, c: 1, parent: 1 });

        d!();
        expect(counts).toEqual({ a: 1, c: 1, parent: 1 });
    });

    it('errors from several nodes in one drain aggregate', () => {
        let d: VoidFunction | null = null;

        root((dispose) => {
            d = dispose;
            onCleanup(() => { throw new Error('parent'); });
            effect(() => {
                onCleanup(() => { throw new Error('child'); });
            });
        });

        try {
            d!();
            expect.unreachable();
        }
        catch (e) {
            expect(e).toBeInstanceOf(AggregateError);
            expect((e as AggregateError).errors.map((x) => (x as Error).message)).toEqual(['parent', 'child']);
        }
    });

    it('a throwing child cleanup during a re-run still disposes later siblings', async () => {
        let log: string[] = [],
            node: Computed<unknown> | null = null,
            s = signal(0);

        node = computed(() => {
            if (read(s) === 0) {
                effect(() => {
                    onCleanup(() => { throw new Error('rerun boom'); });
                });
                effect(() => {
                    onCleanup(() => { log.push('sibling'); });
                });
            }

            return read(s);
        }) as Computed<unknown>;

        flush();

        let captured = await captureUncaught(() => {
            write(s, 1);
            flush();
        });

        expect(log).toEqual(['sibling']);
        expect(captured.map((e) => (e as Error).message)).toEqual(['rerun boom']);
        expect(registrations(node)).toBe(0);
    });
});


describe('owner() as an ownership probe', () => {
    it('is true inside a tracking root or a run (also untracked), false outside and in a detached root', () => {
        let seen: boolean[] = [],
            stop = effect(() => {
                seen.push(current() !== null);
                seen.push(untrack(() => current() !== null));
                seen.push(untrack(() => root(() => current() !== null)));
            });

        seen.push(current() !== null);
        seen.push(untrack(() => current() !== null));
        root((d) => { seen.push(current() !== null); d(); });
        root(() => { seen.push(current() !== null); });
        dispose(stop);

        expect(seen).toEqual([true, true, false, false, false, true, false]);
    });

    it('is true inside untrack during a re-run', async () => {
        let s = signal(0),
            seen: boolean[] = [],
            stop = effect(() => {
                read(s);
                seen.push(untrack(() => current() !== null));
            });

        write(s, 1);
        await Promise.resolve();
        dispose(stop);

        expect(seen).toEqual([true, true]);
    });
});

describe('owner', () => {
    it('is the running computation, else the running root scope, else null', () => {
        let running: Computed<unknown> | null = null,
            scope: Computed<unknown> | null = null,
            seen: unknown[] = [];

        seen.push(current());

        let stop = root((dispose) => {
            scope = current();

            effect(() => {
                running = current();
                seen.push(untrack(() => current()) === running);
            });

            return dispose;
        });

        seen.push(current());

        expect(scope).not.toBeNull();
        expect(running).not.toBe(scope);
        // An effect is owned once its first run returns
        expect(running!.owner).toBe(scope);

        stop();

        expect(seen).toEqual([null, true, null]);
    });
});

describe('root with an owner', () => {
    it('runs fn owned by the given node, its reads untracked', async () => {
        let cleaned = 0,
            s = signal(0),
            node: Computed<unknown> | null = null,
            runs = 0,
            stop = root((dispose) => {
                node = current();

                return dispose;
            });

        root(() => {
            runs++;
            read(s);
            onCleanup(() => cleaned++);
            effect(() => { read(s); });
        }, node);

        expect(current() !== null).toBe(false);
        expect(registrations(node!)).toBe(2);

        write(s, 1);
        await Promise.resolve();

        expect(runs).toBe(1);

        stop();

        expect(cleaned).toBe(1);
        expect(registrations(node!)).toBe(0);
    });

    it('creates a child root of the given node instead of whatever is running', () => {
        let a: Computed<unknown> | null = null,
            b: Computed<unknown> | null = null,
            child: Computed<unknown> | null = null,
            stopA = root((dispose) => { a = current(); return dispose; }),
            stopB = root((dispose) => { b = current(); return dispose; });

        root(() => {
            root((dispose) => {
                child = current();

                return dispose;
            }, a);
        }, b);

        expect(child!.owner).toBe(a);
        expect(registrations(b!)).toBe(0);

        stopA();

        expect(child!.owner).toBe(null);

        stopB();
    });

    it('throws on a disposed owner', () => {
        let node: Computed<unknown> | null = null,
            stop = root((dispose) => { node = current(); return dispose; });

        stop();

        expect(() => root(() => {}, node)).toThrow('@esportsplus/reactivity: root() was given a disposed owner');
    });
});

---
api-impact: none
depends-on: [async-error-propagation, signal-is-selector]
files-own: [tests/unobserved.ts]
files-shared: [src/system.ts]
priority: P2
recommended-model: opus
status: PENDING
tests: [tests/unobserved.ts]
type: feature
---

# onUnobserved() — last-subscriber lifecycle hook

## Rationale

Enables template-side cache eviction (drop derived caches when nothing renders them) and async cancellation without polling; both consumers exist downstream. Solid 2.0's `unobserved` callback (S2 finding 12) / TC39 watched-unwatched (S3 finding 5), minimal form. Re-authored from the predecessor: the Design was complete but the block left almost no evidence (scoped RED, no per-test breakdown) — this authoring tightens tests/unobserved.ts into six concrete, individually assertable tests so the next failure names itself.

## Changes

- src/system.ts: unobservers WeakMap, onUnobserved export, unlink() fire site.
- tests/unobserved.ts: new — six concrete tests spelled in Design.

## Design

A callback fired when a node's subscriber count drops to zero. Internal API (same tiny-surface stance as signal.is — exported but undocumented for end users).

**Storage**: module-level `unobservers = new WeakMap<Signal<unknown> | Computed<unknown>, VoidFunction[]>()` in src/system.ts — no node field: this is cold, opt-in state on few nodes, unlike the hot pre-declared fields (keys/equals/rv/gv) which every node checks on hot paths. Register via exported `onUnobserved(node, fn)`; returns an unregister function (splice by identity). Export lands in the src/system.ts export statement in alphabetical position (after `onCleanup`).

**Fire site**: unlink() (src/system.ts:421-458), inside the existing `(dep.subs = nextSub) === null` branch (:437-450) — AFTER the computed auto-dispose (`dispose(dep)` at :439) and after the selector-entry eviction (:441-449): `let fns = unobservers.get(dep); if (fns !== undefined) { for (let i = 0, n = fns.length; i < n; i++) { fns[i](); } }`. The fire applies to ANY dep whose subs reach null — plain signals (which deliberately never auto-dispose) take the same code path with neither prior conditional triggering.

**Ordering pin (the judgment residue — critic validates)**: callbacks fire AFTER dispose(dep) for computeds — the node is already torn down (deps unlinked, cleanup run, disposal run) when its callbacks observe it; callbacks are notifications, not interceptors. Callbacks run synchronously inside unlink; writes from a callback are legal and simply schedule normally — a callback must not assume mid-teardown reads of the disposed node are meaningful.

**WeakMap-get cost**: unlink's zero-subs branch is cold (last unsubscribe only); the hot unlink path (nextSub non-null) is untouched.

**Coordination pin**: recursion-free-walks (next in document order) converts the dispose()/unlink() cascade to an iterative drain and RELOCATES this fire site with the teardown — the per-node ordering contract (deps unlinked → cleanup → disposal → unobserved callbacks) is what this item's tests assert, and those tests must pass unmodified after that item lands.

**AbortController recipe** (a documented pattern test, NOT wiring): an asyncComputed paired with `onUnobserved(wrapper, () => controller.abort())` proves in-flight work can be cancelled when the last reader leaves. Changing asyncComputed's fn signature to pass an AbortSignal is explicitly OUT of scope (API growth needs its own decision). The recipe test registers the abort ONLY through onUnobserved — no onCleanup abort — so a passing assert proves the hook fired (production code would pair both; say so in the test file's header comment, one line).

**tests/unobserved.ts — six tests, concrete asserts** (public-API imports from ~/system only; mirror tests/untrack.ts conventions):

1. **Fires exactly once on last-unsub of a signal**: `s = signal(1)`, `fired = 0`, `onUnobserved(s, () => fired++)`; `stop = effect(() => read(s))`; assert `fired === 0`; `stop()`; assert `fired === 1`.
2. **Not on intermediate unsubscribes**: two effects reading `s`; stop the first → assert `fired === 0`; stop the second → assert `fired === 1`.
3. **Re-subscribe then re-unsubscribe refires**: continue from a fired signal: new `effect(() => read(s))`, stop it → assert `fired === 2` (registration survives; it is not one-shot).
4. **Computed fires on last-unsub AFTER auto-dispose**: `log: string[]`; `c = computed((onCleanup) => { onCleanup(() => log.push('cleanup')); return read(s); })`; `onUnobserved(c, () => log.push('unobserved'))`; `stop = effect(() => read(c))`; `stop()`; assert `log` ends `['cleanup', 'unobserved']` in that order — the ordering pin as a literal assert.
5. **Unregister prevents firing**: `off = onUnobserved(s, cb)`; `off()`; subscribe + unsubscribe; assert cb never ran. Also: unregistering one of two callbacks leaves the other firing.
6. **AbortController recipe cancels in-flight work on last-unsub**: factory allocates a fresh `AbortController` per dispatch into a captured local, returns a never-settling `new Promise<number>(() => {})`; an `abort` event listener flips `aborted`; `onUnobserved(node, () => controller.abort())`; keeper `stop = effect(() => read(node))`; assert `aborted === false`; `stop()` (keeper leaves → wrapper auto-disposes → hook fires); assert `aborted === true`.

Implementer discretion: exact helper structure inside the test file and whether tests 1-3 share a describe block; criterion: each numbered assert above appears verbatim-equivalent and individually named.

## Reads

- src/system.ts — unlink() zero-subs branch as landed by signal-is-selector (anchors above)
- tests/async-hardening.ts — asyncComputed patterns the recipe test builds on
- tests/untrack.ts — test-file conventions to mirror (public-API imports from ~/system only)

## Acceptance

1. onUnobserved fires exactly once when the last subscriber of a signal unlinks; not on intermediate unsubscribes (2 subs → 1); re-subscribe then re-unsubscribe fires again.
2. Works for computeds: fires on last-unsub AFTER the existing auto-dispose, asserted as a literal cleanup-then-callback ordering; the unregister function prevents firing.
3. The AbortController recipe test cancels an in-flight dispatch on last-unsub, with the abort wired ONLY through onUnobserved.
4. tests/unobserved.ts EXISTS on disk with the six Design tests and 0 regressions run scoped; `pnpm exec tsc --noEmit` green.

## Verify

Callback-ordering semantics inside teardown (fire-after-dispose) is judgment residue — critic validation; the ordering is nonetheless pinned as a literal assert in test 4, so a violation fails the scoped run before it reaches the critic. Scoped run: `pnpm run test tests/unobserved.ts` + `pnpm exec tsc --noEmit`.

## Notes

Re-authored from storage/spec-signals-next unobserved-hooks (BLOCKED: scoped RED with no per-test breakdown — least-evidence block of the run). Discharge via `finalize-directory --migrated-to`. Cross-reference: recursion-free-walks relocates the fire site into its iterative teardown drain; this item's tests are the contract that relocation must preserve.

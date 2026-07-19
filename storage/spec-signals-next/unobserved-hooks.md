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

## Design

Solid 2.0's `unobserved` callback (S2 finding 12) / TC39 watched-unwatched (S3 finding 5), minimal form: a callback fired when a node's subscriber count drops to zero. Internal API (same tiny-surface stance as signal.is — exported but undocumented for end users).

**Storage**: module-level `unobservers = new WeakMap<Signal<unknown> | Computed<unknown>, VoidFunction[]>()` in src/system.ts — no node field: this is cold, opt-in state on few nodes, unlike the hot pre-declared fields (keys/equals/rv/gv) which every node checks on hot paths. Register via exported `onUnobserved(node, fn)`; returns an unregister function (splice by identity).

**Fire site**: unlink() (src/system.ts:309-335), inside the existing `(dep.subs = nextSub) === null` branch — after the computed auto-dispose / selector-entry eviction handling from prior items: `let fns = unobservers.get(dep); if (fns) { for (...) fns[i](); }`. Ordering pin: callbacks fire AFTER dispose(dep) for computeds (the node is already torn down; callbacks are notifications, not interceptors) and after selector-entry eviction. Callbacks run synchronously in unlink — document that a callback must not write signals mid-teardown expectations (writes are legal, they just schedule normally).

**WeakMap-get cost**: unlink's zero-subs branch is cold (last unsubscribe only); the hot unlink path (nextSub non-null) is untouched.

**AbortController recipe** (evidence's "natural hook for async" — recipe, NOT wiring): tests/unobserved.ts includes a documented pattern test — an asyncComputed whose factory allocates an AbortController per dispatch via onCleanup, paired with `onUnobserved(wrapper, () => controller.abort())` — proving in-flight work can be cancelled when the last reader leaves. Changing asyncComputed's fn signature to pass an AbortSignal is explicitly OUT of scope (API growth needs its own decision).

## Rationale

Enables template-side cache eviction (drop derived caches when nothing renders them) and async cancellation without polling; both consumers exist downstream.

## Changes

- src/system.ts: unobservers WeakMap, onUnobserved export, unlink fire site.
- tests/unobserved.ts: new.

## Acceptance

1. onUnobserved fires exactly once when the last subscriber of a signal unlinks; not on intermediate unsubscribes (2 subs → 1); re-subscribe then re-unsubscribe fires again.
2. Works for computeds: fires on last-unsub alongside (after) the existing auto-dispose; the unregister function prevents firing.
3. The AbortController recipe test cancels an in-flight dispatch on last-unsub.
4. 0 regressions in tests/unobserved.ts run scoped; `pnpm exec tsc --noEmit` green.

## Reads

- src/system.ts — unlink() zero-subs branch as landed by signal-is-selector
- tests/async-hardening.ts — asyncComputed patterns the recipe test builds on

## Verify

Callback-ordering semantics inside teardown (fire-after-dispose) is judgment residue — critic validation.

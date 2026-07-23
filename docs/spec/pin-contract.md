# Pin contract — "reading mode is sacred"

Every clause here is testable and tested; clause IDs are referenced from e2e
tests. Vocabulary per CONTEXT.md.

## P1 — Pin holds pixel-stable

While pinned, the list bottom equals the viewport bottom on **every rendered
frame**, including during token streaming that grows the tail every ~30ms.

- Gate: 0 frames with >1.5px deviation over a sustained streaming window,
  measured by an independent rAF sampler (not the library's own bookkeeping).
- Mechanism constraint (measured, not stylistic): the correction MUST run inside
  the commit that mutated content — after DOM mutation, before paint
  (`useLayoutEffect` in React). rAF-loop and ResizeObserver corrections are one
  frame late (~8.8% jitter measured) and are permitted only as **backstops** for
  growth that happens outside commits (image/font loads).

## P2 — Only user scrolls change pin state

- P2a. Unpin: a user-initiated upward scroll unpins immediately. No velocity or
  distance heuristics.
- P2b. Repin: a user scroll (including momentum settle) arriving within the
  repin threshold (default 2px) of the bottom repins. Explicit
  `scrollToBottom()` repins.
- P2c. Programmatic scrolls NEVER change pin state **via the scroll-event
  path** — pin corrections and anchor compensations are invisible to the state
  machine. Explicit navigation APIs are app intent, expressed as API-level
  state changes, not scroll side effects: `scrollToBottom()` pins;
  `scrollToMessage()` enters reading mode.
- P2d. Mechanism: scroll-source discrimination via expected-offset bookkeeping
  (every programmatic write is registered and matched against incoming scroll
  events). Timestamp windows are disqualified: the spike measured corrections
  refreshing the window every frame and swallowing real user scrolls.

## P3 — Reading mode: zero content movement

While unpinned, nothing in the viewport may move, for any mutation:

- P3a. Prepend (history load above): anchor compensation in the same commit —
  0px immediate shift.
- P3b. Settle: as estimates are replaced by measurements after a mutation,
  residual drift is corrected — 0px cumulative drift over the settle window.
- P3c. Streaming growth below the viewport: no compensation needed, but MUST
  NOT be converted into movement by any correction path.
- P3d. Removals/replacements above the viewport: compensated like prepends.

## P4 — Mode transitions are invisible

- P4a. Flow→Windowed (crossing the threshold upward) happens only while pinned
  (bottom-locked before and after, 0 jitter frames through the switch) or while
  idle-at-rest with anchor compensation.
- P4b. If the user is unpinned and reading, the transition is DEFERRED until
  repin. Count may exceed the threshold meanwhile; correctness beats memory.
- P4c. Windowed→Flow (shrink below threshold) follows the same gating.

## P5 — State is observable, UI is not shipped

`pinned` state and its transitions are exposed synchronously (callback + handle
getter). The library renders no "new messages" chip; apps build their own from
the exposed state.

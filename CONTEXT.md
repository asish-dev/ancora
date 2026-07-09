# ancora

Behavior layer for chat/streaming message lists: pixel-stable bottom pinning and
anchor-stable history loading, with virtualization hidden as an implementation
detail.

## Language

### Pinning

**Pin**:
The state in which the list bottom is locked to the viewport bottom, so streaming
content is always fully visible.
_Avoid_: stick, follow, auto-scroll

**Unpin**:
The transition out of Pin, caused only by a user-initiated upward scroll.
_Avoid_: detach, release

**Repin**:
The transition back into Pin, caused by user scroll arriving within the repin
threshold of the bottom, or by an explicit scroll-to-bottom call.

**Correction**:
A programmatic scrollTop write that restores an invariant (pin or anchor).
Corrections never change pin state.

**Jitter**:
A rendered frame in which the pinned list bottom visibly deviated from the
viewport bottom (>1.5px). The pin guarantee is zero jitter frames.
_Avoid_: wobble, shimmer

### Reading mode

**Reading mode**:
The unpinned state. Its guarantee: zero content movement — nothing the user is
looking at may shift on screen, for any reason.

**Anchor**:
The on-screen reference item (first item intersecting the viewport top) whose
screen position must be preserved across a mutation.

**Compensation**:
The scrollTop adjustment that keeps the Anchor stationary when content above it
changes size or count.

**Settle**:
The window after a mutation during which estimated item sizes are replaced by
measured ones, producing secondary drift that must also be compensated.

### Data

**Operation**:
A semantic list mutation consumed by the core: Prepend, Append, GrowTail,
SwapKey, Remove, Reset. The internal contract between differ and core.

**Differ**:
The single canonical function that compiles a change of the declarative
`messages` array into Operations. Its inference rules are specced, not emergent.

**Key**:
The stable identity of a message across renders. Key stability is a user
contract; the differ detects violations in development.

**Key alias**:
A user-declared identity equivalence (optimistic temp id → server id) letting
the differ see a SwapKey instead of Remove+Append.

### Rendering

**Engine**:
The virtualization implementation (currently TanStack Virtual). Never part of
the public API.
_Avoid_: virtualizer (in public docs)

**Flow mode**:
Rendering as natural DOM flow (no windowing) below the mode threshold. Native
find-in-page, selection, and accessibility behave normally.

**Windowed mode**:
Rendering only the visible range via the Engine, with absolutely positioned rows.

**Mode transition**:
The switch between Flow and Windowed. Gated: it may only happen at safe moments
(pinned or idle), never visibly.

**Scroll-source discrimination**:
Classifying each scroll event as user-initiated or programmatic via expected-
offset bookkeeping. Timestamp windows are disqualified (measured: corrections
swallow user scrolls).

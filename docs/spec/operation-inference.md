# Operation inference — differ rules

The differ compiles (prevMessages, nextMessages, getKey, keyAliases?) into
Operations. It is the ONLY producer of Operations in v1. Rules are exact;
property tests generate random operation sequences and assert round-trip
inference. Clause IDs are referenced from tests.

Notation: `P = prev keys`, `N = next keys` (after alias normalization, D2).

## D1 — Identity

- D1a. Keys must be unique within a render. Duplicate keys: dev-mode error,
  inference degrades to Reset.
- D1b. Key stability is the user contract that makes anchoring possible. The
  differ never uses index as identity.

## D2 — Alias normalization (optimistic swap)

- D2a. Before diffing, each key in `N` is mapped through `keyAliases`
  (alias → canonical). If `keyAliases.get(n) ∈ P`, the item is the SAME item:
  emit `SwapKey(from, to)` and treat positions as unchanged.
- D2b. Without an alias, a temp-id→server-id swap is indistinguishable from
  Remove+Append. Heuristic (dev-mode only, no behavior change): tail-position
  removal + insertion at the same position warns and suggests `keyAliases`.

## D3 — Fast paths (order matters; first match wins)

- D3a. `P == N` (same keys, same order): emit `GrowTail` if any message object
  identity changed, else no ops. (GrowTail is named for the dominant streaming
  case; it covers any in-place content change — position math is unaffected
  because keys/order didn't change.)
- D3b. `P` is empty: emit `Reset(N)`.
- D3c. `N` is empty: emit `Reset(empty)`.

## D4 — Structural inference

Let `i0 = indexOf(N, P[0])` and `i1 = indexOf(N, P[last])`.

- D4a. **Prepend**: if `i0 > 0` and `N[i0..]` starts with a prefix of `P`:
  `Prepend(count = i0)`; keys `N[0..i0)` must not exist in `P` (else D4d).
- D4b. **Append**: if `i1 >= 0` and `i1 < N.length - 1` and `N[..i1]` ends with
  a suffix of `P`: `Append(count = N.length - 1 - i1)`; appended keys must be
  new (else D4d).
- D4c. **Remove**: keys in `P` missing from `N`, when the surviving subsequence
  order is preserved: `Remove(keys)` with each key's former index (indices are
  what anchor compensation needs).
- D4d. **Reset (fallback)**: any structure the above cannot express exactly —
  reordering, moved blocks, interleaved inserts — emits `Reset`. Reset preserves
  the anchor BY KEY when the anchor key survives; pin state is never changed by
  any operation.
- D4e. Compositions of D4a+D4b+D4c in one commit (e.g. prepend 20 + tail append
  while streaming) are inferred as multiple ops in document order: Prepend,
  Remove, Append, plus GrowTail if surviving objects changed.

## D5 — Complexity budget

Inference is O(|P| + |N|) per commit (hash-map key lookup, no LCS). At the
streaming cadence (~33Hz) and chat scale (≤10k messages) this is sub-millisecond;
the 100k event-log case is explicitly out of v1 scope (future imperative
producer, ADR-0002).

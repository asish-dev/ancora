# Declarative public API compiled to internal semantic operations

Status: accepted

The public data API is a `messages` array plus stable key — nothing else. One
canonical differ compiles array changes into semantic Operations (Prepend,
Append, GrowTail, SwapKey, Remove, Reset) consumed by the core. We rejected
(a) an imperative data handle as the primary API (VirtuosoMessageList style)
and (b) pure diff-where-needed with no operation layer.

Rationale: the primary adopter holds a `useChat`-shaped messages array that gets
a new identity every streaming tick — declarative input makes the AI SDK adapter
nearly free and matches React idiom, while an imperative-primary API just moves
the same array-diffing problem into every app (or into our adapter, meaning we
maintain a differ anyway *plus* an imperative surface). But raw diffing as an
implicit contract is too weak for the core: exact operation semantics are what
make anchor decisions, Fenwick-style structures, and property testing possible.
So: Option 1's API with Option 2's architecture. The operation layer also keeps
an imperative handle available later as *another producer of the same
operations* — additive, never a v1 blocker, no dual-ownership semantics.

Consequence: the differ's inference rules are a spec (docs/spec/
operation-inference.md) with property tests — including the ambiguous cases
(prepend+append in one commit; optimistic temp-id→server-id swap, which without
a key alias is indistinguishable from Remove+Append and triggers a dev warning).

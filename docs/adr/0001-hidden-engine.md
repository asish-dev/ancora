# TanStack Virtual is a hidden engine, not part of the public contract

Status: accepted

The spike verdict (2026-07-09) proved a behavior layer over TanStack Virtual can
hold 0.00% pin jitter and 0px prepend anchor shift using public API only. We
considered exposing TanStack in our API (peer-dep ecosystem play, escape hatches
for free) versus hiding it entirely. We hide it: no TanStack type appears in any
exported signature; it is a peer dependency with a **narrow, CI-tested version
range**, and widening that range is a release step gated on re-running the full
Playwright battery.

Rationale — two asymmetries. **Failure asymmetry:** TanStack is actively building
in exactly this area (`pendingScrollAnchor`, iOS deferred adjustment); if they
ship native pinning or break an internal we depend on behaviorally, an exposed-
engine library is existentially obsolete, while a hidden-engine library absorbs
it invisibly. (Precedent: `shouldAdjustScrollPositionOnItemSizeChange` silently
moved from constructor option to instance property within a minor series.)
**Reversibility asymmetry:** hidden→exposed is an additive change later;
exposed→hidden is a user-facing rewrite. Hiding also keeps the wrap-vs-own
decision permanently reversible — a custom core could replace TanStack in a
minor version — and makes dual-mode rendering coherent (there is no exposed
virtualizer to explain when Flow mode isn't virtualizing).

Consequence: any Engine capability we don't re-expose is a feature request only
we can fill; if power-user demand appears, the answer is an explicitly-unstable
`unstable_engine` export, not API exposure.

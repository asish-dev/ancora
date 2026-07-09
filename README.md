# ancora

Pixel-stable message lists for AI chat and streaming event logs. MIT.

`ancora` (Italian: *anchor*) is a virtualized chat list that holds two guarantees
that break every hand-rolled solution:

1. **The bottom pin is pixel-stable while tokens stream.** The tail can grow
   every 30ms and the list bottom never wobbles — 0 jitter frames, enforced in CI.
2. **Reading mode is sacred.** When you scroll up, nothing you're looking at
   moves — not for prepended history, not for streaming growth, not for late
   measurements. 0px anchor shift, enforced in CI.

## Packages

| Package | What it is |
| --- | --- |
| `@ancora/core` | Framework-agnostic behavior core: pin state machine, scroll-source discrimination, anchor math, operation inference. Pure logic, no DOM. |
| `@ancora/react` | The flagship `<ChatList>` component. Declarative API (`messages` + key), dual-mode rendering, hidden virtualization engine. |

## Design in one paragraph

Below a threshold (default 100 messages) the list renders as **natural DOM** —
find-in-page, text selection, and accessibility all work, because most chats are
short and deserve a normal page. Above it, rendering switches (only at safe
moments) to **windowing** on top of TanStack Virtual — which is an internal
engine, never part of the public API. All list mutations are compiled by a
single specced differ into semantic operations (`prepend`/`append`/`growTail`/…)
consumed by the core. Pin corrections happen inside React's commit
(`useLayoutEffect` — after DOM mutation, before paint), which is the only
correction timing that measures 0.00% jitter; rAF-loop and ResizeObserver
correctors measure ~8.8% and are used only as backstops for non-commit growth
(images, fonts).

## Certification matrix

| Environment | Status |
| --- | --- |
| Chrome / Chromium (desktop) | ✅ certified — CI gate: 0 jitter frames, 0px anchor shift |
| Safari / WebKit (desktop) | ✅ certified — same gates |
| Firefox (desktop) | ✅ certified — same gates |
| iOS Safari | ⚠️ **not yet certified** — momentum scrolling + rubber-banding are not exercised by desktop WebKit. iOS certification is the flagship post-v1 milestone. |

## Development

```bash
npm install
npm test          # @ancora/core unit + property tests (Node, no browser)
npm run dev       # playground (the measurement harness from the original spike)
npm run e2e       # Playwright battery: Chromium + WebKit + Firefox hard gates
```

## Provenance

This library is the product of a measured spike (see `e2e/reference/` for the
original verdict scripts). Key measured facts the design rests on:

- useLayoutEffect pin correction: **0.00% jitter** (Chromium + WebKit).
- rAF-loop and ResizeObserver correction: **~8.8% jitter** (one frame late).
- No correction: deviation runs away to 1427px over ~8s of streaming.
- Prepend anchor compensation: **0px** immediate + settle, without touching
  TanStack's semi-private `shouldAdjustScrollPositionOnItemSizeChange`.

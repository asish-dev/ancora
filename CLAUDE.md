# CLAUDE.md — ancora

Pixel-stable virtualized message list for AI chat / streaming logs. MIT
alternative to react-virtuoso's commercial VirtuosoMessageList. This file is the
working context for the repo; `CONTEXT.md` is the glossary, `docs/` holds the
specs and ADRs. Read those before changing behavior.

## The two guarantees (the whole point of the library)

1. **Pin is pixel-stable while tokens stream** — the tail grows every ~30ms and
   the list bottom never wobbles. 0 jitter frames, enforced in CI.
2. **Reading mode is sacred** — when the user has scrolled up, nothing on screen
   moves, for any mutation (prepended history, streaming growth, late
   measurement). 0px anchor shift, enforced in CI.

These are behavioral contracts, not aspirations. `docs/spec/pin-contract.md`
(clauses P1–P5) is the source of truth; the e2e gates are keyed to it. A red
gate means a guarantee regressed — never loosen a gate to make it pass.

## Layout

| Path | What |
|---|---|
| `packages/core` | Framework-free logic: pin state machine, scroll-source ledger, anchor math, operation inference. No DOM, no React. Unit + property tested in Node. |
| `packages/react` | The flagship `<ChatList>`. Owns the scroller DOM, wires the core to `useLayoutEffect`, hides the engine. |
| `apps/playground` | Streaming harness (port 5199) + an external rAF instrument that measures the library from outside + a naive-list canary. Dev tool and e2e fixture. |
| `e2e` | Playwright battery (Chromium/WebKit/Firefox) — the originating spike's tests, promoted to hard gates. |
| `docs/adr` | 0001 hidden engine, 0002 declarative API / operations inside. |
| `docs/spec` | `pin-contract.md` (P1–P5), `operation-inference.md` (D1–D5). |
| `e2e/reference` | The original spike's raw measurement scripts, kept as provenance. Not run by CI. |

## Commands

```bash
npm install
npm test          # @ancora/core unit + property tests (Node, fast, no browser)
npm run typecheck # tsc -b over core + react + playground
npm run dev       # playground at http://localhost:5199
npm run e2e       # full battery on all 3 engines (starts the playground itself)
# single engine while iterating:
cd e2e && npx playwright test --project=chromium
```

Playground URL params for reproducing scenarios: `?count=N` (history size),
`?threshold=N` (virtualize threshold), `?stream=0` (start paused), `?naive=1`
(no-correction canary), `?autoload=1` (onReachTop → prepend).

## Architecture decisions that constrain all changes

- **The engine (TanStack Virtual) is hidden** (ADR-0001). No TanStack type appears
  in any exported signature. It is a peer dep with a narrow, CI-tested range.
  This keeps wrap-vs-own reversible and survives TanStack shipping native pinning.
  Do not re-export or leak it.
- **Public API is declarative** (ADR-0002): `messages` array + stable `getKey`.
  A single differ (`packages/react/src/differ.ts` → `@ancora/core`
  `inferOperations`) compiles array changes into semantic Operations. Any new
  data path must produce Operations, not bypass them.
- **Component-first**: `<ChatList>` owns the scroller so the CSS/timing invariants
  hold. The internal hook is private; promoting it later is additive.
- **Dual-mode**: Flow (natural DOM) below `virtualizeThreshold` (default 100),
  Windowed above. Behavior must be spec-identical in both. Transitions are gated
  to safe moments (P4) — never switch modes while the user is reading.

## Invariants that were each MEASURED, not theorized — do not re-litigate

These are the traps that cost real debugging. Each is defended at a specific
place in `packages/react/src/ChatList.tsx` / `packages/core/src/pin-controller.ts`
with a comment; if you touch that code, keep the defense.

1. **Corrections belong in the commit, not a rAF loop or a ResizeObserver.**
   `useLayoutEffect` runs after the token-growth DOM commit but before paint —
   0.00% jitter. rAF and RO are one frame late (~8.8% jitter, measured). RO
   survives only as a backstop for non-commit growth (images/fonts).
2. **ancora is the SINGLE scroll authority.** The engine's `scrollToFn` is a
   no-op (`() => {}`); the engine never writes scrollTop. Its own mount reset and
   prepend auto-anchoring fight our corrections otherwise (measured 823px double-
   compensation, and a pin stomped to 0 on StrictMode remount).
3. **Three scroll sources, not two.** A scroll event is `programmatic` (matches
   our expected-offset ledger), `user` (unmatched AND corroborated by a recent
   wheel/touch/key/held-pointer), or `system` (unmatched, no input — a browser
   clamp when content shrinks). Only `user` changes pin state. Timestamp windows
   are disqualified — they swallow the user's own scroll.
4. **Anchor compensation restores an ABSOLUTE invariant** (`docOffset −
   viewportTop`), never a relative delta. Relative schemes double-compensate
   against the engine's interleaved adjustments.
5. **Never pick an anchor mid-commit.** Mid-commit engine state is not a coherent
   basis; a blind re-pick captured a row at −1233px. Anchors are picked only on
   real scroll events, where layout is settled.
6. **`endUserIntent` must pair with a `beginUserIntent`.** The host listens for
   pointerup globally, so an unpaired release (any button click on the page) must
   grant no scroll intent — else a clamp right after clicking scrollToBottom reads
   as a user scroll and unpins.

## Verification expectations

Any change touching scroll/anchor/pin code must keep the battery green on all
three engines (`npm run e2e`), not just Chromium. The two headline gates must
read exactly **0 jitter frames** and **<1px anchor shift**. When adding behavior,
add or extend a spec clause in `docs/spec/` and a gate that enforces it.

## Not in v1 (roadmap, tracked in README)

iOS Safari certification (flagship v1.x milestone — desktop-certified only for
now), AI SDK `useChat`-shaped adapter, imperative data handle for 100k-row logs.
Packages are `private` pending an npm-name availability check.

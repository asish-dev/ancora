// <ChatList> — the flagship component (component-first API, hidden engine).
//
// Correction architecture (docs/spec/pin-contract.md):
// - ALL corrections run in a useLayoutEffect with no dependency array: it runs
//   on every commit — message commits AND engine-measurement commits — after
//   DOM mutation, before paint. This is the only timing that measured 0.00%
//   jitter in the originating spike (rAF/ResizeObserver correctors: ~8.8%).
// - A ResizeObserver exists ONLY as a backstop for growth that happens outside
//   commits (image/font loads).
// - Every programmatic scrollTop write is registered with the PinController's
//   ledger so its scroll event is never misread as user intent (P2d).
//
// Anchor architecture (P3, "reading mode is sacred"):
// - The anchor's DOCUMENT offset (content-relative), not its viewport offset,
//   is the baseline. User scrolls change scrollTop but not document offsets;
//   content mutations change document offsets but not scrollTop. Compensating
//   only document-offset deltas means we never fight the user's own scrolling.
// - This single mechanism covers prepends, removals above, resets with a
//   surviving anchor, AND windowed-mode settle (estimate→measurement commits
//   re-run the same effect), with no per-operation cases.

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { AnchorTracker, PinController } from "@ancora/core";
import { diffMessages } from "./differ";

export interface ChatListHandle {
  /** Whether the list is pinned to the bottom. */
  readonly pinned: boolean;
  /** Scroll to the bottom and pin (P2c: explicit API intent). */
  scrollToBottom(): void;
  /**
   * Scroll a message to the top of the viewport and enter reading mode.
   * Converges over a few frames in windowed mode while estimates refine.
   * Resolves true when within 1px of the target.
   */
  scrollToMessage(key: string): Promise<boolean>;
}

export interface ChatListProps<M> {
  messages: readonly M[];
  /** Stable identity across renders — the anchoring contract (CONTEXT.md: Key). */
  getKey: (message: M, index: number) => string;
  renderMessage: (message: M, index: number) => ReactNode;
  /** Pin transitions (P5). The library ships no "new messages" chip. */
  onPinChange?: (pinned: boolean) => void;
  /** Fired once when a user scroll enters the top zone — load older history. */
  onReachTop?: () => void;
  /** Above this count, rendering switches to windowing (at safe moments — P4). */
  virtualizeThreshold?: number;
  /** Windowed-mode size estimate before measurement. */
  estimateSize?: (message: M, index: number) => number;
  /** Optimistic identity equivalences: newKey → previousKey (D2a). */
  keyAliases?: ReadonlyMap<string, string>;
  /** px-from-bottom within which a user scroll repins (default 2). */
  repinThreshold?: number;
  /** px-from-top defining the onReachTop zone (default 200). */
  reachTopThreshold?: number;
  handleRef?: Ref<ChatListHandle>;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_THRESHOLD = 100;
const SCROLLER_STYLE: CSSProperties = {
  overflowY: "auto",
  // One anchoring authority: ours. Native scroll anchoring differs per engine
  // (and never applies to the absolutely-positioned windowed rows anyway).
  overflowAnchor: "none",
};

export function ChatList<M>({
  messages,
  getKey,
  renderMessage,
  onPinChange,
  onReachTop,
  virtualizeThreshold = DEFAULT_THRESHOLD,
  estimateSize,
  keyAliases,
  repinThreshold,
  reachTopThreshold = 200,
  handleRef,
  className,
  style,
}: ChatListProps<M>) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // --- core instances (stable) ----------------------------------------------
  const pinRef = useRef<PinController | null>(null);
  if (pinRef.current === null) {
    pinRef.current = new PinController(
      repinThreshold !== undefined ? { repinThreshold } : {},
    );
  }
  const pin = pinRef.current;
  const anchorRef = useRef<AnchorTracker | null>(null);
  if (anchorRef.current === null) anchorRef.current = new AnchorTracker();
  const anchor = anchorRef.current;

  useEffect(() => {
    pin.onChange = (p) => onPinChangeRef.current?.(p);
    return () => {
      pin.onChange = null;
    };
  }, [pin]);
  const onPinChangeRef = useRef(onPinChange);
  onPinChangeRef.current = onPinChange;
  const onReachTopRef = useRef(onReachTop);
  onReachTopRef.current = onReachTop;

  // --- mode (P4): gated flow ↔ windowed ------------------------------------
  const wantWindowed = messages.length > virtualizeThreshold;
  const [windowed, setWindowed] = useState(wantWindowed);
  // Safe to switch during render only when pinned: the same commit's layout
  // effect re-locks the bottom pre-paint, so the transition is invisible (P4a).
  // Unpinned → defer until repin (P4b), handled in the scroll path.
  if (windowed !== wantWindowed && pin.pinned) setWindowed(wantWindowed);

  // --- keys + engine ---------------------------------------------------------
  // Two views of identity with different sync points:
  // - renderKeys / renderMessagesRef: RENDER-synced — the engine's getItemKey /
  //   estimateSize must see the keys of the commit being rendered, or a prepend
  //   commit misaligns its key-addressed measurement cache.
  // - prevKeysRef / prevMessagesRef: COMMIT-synced — the differ compares the
  //   incoming messages against what was last committed.
  const renderKeys = messages.map((m, i) => getKey(m, i));
  const renderKeysRef = useRef(renderKeys);
  renderKeysRef.current = renderKeys;
  const renderMessagesRef = useRef(messages);
  renderMessagesRef.current = messages;
  const prevKeysRef = useRef<string[]>([]);
  const prevMessagesRef = useRef<readonly M[] | null>(null);
  const estimateRef = useRef(estimateSize);
  estimateRef.current = estimateSize;

  const virtualizer = useVirtualizer({
    count: windowed ? messages.length : 0,
    getScrollElement: () => scrollerRef.current,
    estimateSize: (i) => {
      const msg = renderMessagesRef.current[i];
      return msg !== undefined ? (estimateRef.current?.(msg, i) ?? 100) : 100;
    },
    getItemKey: (i) => renderKeysRef.current[i] ?? `@@${i}`,
    overscan: 6,
    // SINGLE SCROLL AUTHORITY: the engine never writes the DOM scroll
    // position. Its writes serve two purposes we replace: (a) the mount/attach
    // reset (measured stomping our bottom pin to 0 on StrictMode remount) and
    // (b) its own prepend auto-anchoring (measured fighting our compensation
    // between commits — 12px flashes and an 823px double-compensation under a
    // relative scheme). Every adjustment the engine wants is followed by a
    // notify → re-render, and our commit-time correction restores the pin or
    // anchor invariant pre-paint. We never call engine scroll APIs ourselves.
    scrollToFn: () => {},
  });
  const virtualizerRef = useRef<Virtualizer<HTMLDivElement, Element>>(virtualizer);
  virtualizerRef.current = virtualizer;

  // --- geometry helpers ------------------------------------------------------
  const metrics = useCallback(() => {
    const el = scrollerRef.current;
    return el
      ? {
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        }
      : { scrollTop: 0, scrollHeight: 0, clientHeight: 0 };
  }, []);

  /** Registered programmatic write; reads back the clamped value (P2d). */
  const writeScrollTop = useCallback(
    (value: number) => {
      const el = scrollerRef.current;
      if (!el || el.scrollTop === value) return;
      el.scrollTop = value;
      pin.noteProgrammaticScroll(el.scrollTop);
    },
    [pin],
  );

  /** Content-relative document offset (transform-aware; mode-independent). */
  const docOffsetOf = useCallback((node: Element): number => {
    const el = scrollerRef.current;
    if (!el) return 0;
    return (
      node.getBoundingClientRect().top -
      el.getBoundingClientRect().top +
      el.scrollTop
    );
  }, []);

  const nodeByKey = useCallback((key: string): HTMLElement | null => {
    return (
      scrollerRef.current?.querySelector<HTMLElement>(
        `[data-ancora-key="${CSS.escape(key)}"]`,
      ) ?? null
    );
  }, []);

  /** Anchor doc offset — DOM when rendered, engine estimate when windowed out. */
  const anchorDocOffset = useCallback(
    (key: string): number | null => {
      const node = nodeByKey(key);
      if (node) return docOffsetOf(node);
      const index = renderKeysRef.current.indexOf(key);
      if (index < 0) return null;
      if (!windowedRef.current) return null;
      const [offset] = virtualizerRef.current.getOffsetForIndex(index, "start") ?? [null];
      return offset;
    },
    [docOffsetOf, nodeByKey],
  );
  const windowedRef = useRef(windowed);
  windowedRef.current = windowed;

  /**
   * Pick the anchor: first item intersecting the viewport top. Captures the
   * anchor's VIEWPORT-RELATIVE top (docOffset - scrollTop).
   */
  const pickAnchor = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (windowedRef.current) {
      const item = virtualizerRef.current
        .getVirtualItems()
        .find((v) => v.end > el.scrollTop);
      if (item) {
        const node = nodeByKey(String(item.key));
        const docOffset = node ? docOffsetOf(node) : item.start;
        anchor.set(String(item.key), docOffset - el.scrollTop);
      }
    } else {
      const rows = contentRef.current?.children;
      if (!rows) return;
      for (const row of rows) {
        const r = row as HTMLElement;
        const top = docOffsetOf(r); // rect-based: no offsetParent assumptions
        if (top + r.getBoundingClientRect().height > el.scrollTop) {
          anchor.set(r.dataset["ancoraKey"] ?? "", top - el.scrollTop);
          return;
        }
      }
    }
  }, [anchor, docOffsetOf, nodeByKey]);

  /**
   * Reading-mode compensation (P3): restore the absolute invariant
   * `docOffset(anchor) - scrollTop == anchor.position`, via the anchor's real
   * DOM position when rendered, else the engine's offset for it. Both come
   * from the same measurement cache that places the visible rows, so the
   * coordinate system is self-consistent and holding an unrendered anchor is
   * drift-free. Absolute targets make this immune to interleaved third-party
   * scroll adjustments — no re-baselining, no accumulation.
   *
   * Deliberately NO re-anchoring here: mid-commit engine state is not a
   * coherent basis for capturing an anchor (measured: a blind-commit re-pick
   * captured a row at -1233px and froze a 12px error). Anchors are picked
   * only on real scroll events, where layout is settled.
   */
  const compensateAnchor = useCallback(
    (el: HTMLDivElement) => {
      const cur = anchor.current;
      if (!cur) return;
      const node = nodeByKey(cur.key);
      const offset = node ? docOffsetOf(node) : anchorDocOffset(cur.key);
      if (offset === null) {
        anchor.clear(); // anchor left the list; next scroll event re-picks
        return;
      }
      const target = anchor.targetScrollTop(offset);
      if (target !== null && Math.abs(el.scrollTop - target) > 0.5) {
        writeScrollTop(target);
      }
    },
    [anchor, nodeByKey, docOffsetOf, anchorDocOffset, writeScrollTop],
  );

  // --- THE commit-time correction path (P1 + P3) -----------------------------
  // No dependency array: every commit, message- or measurement-driven.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    // 1) diff (identity bookkeeping + diagnostics)
    if (prevMessagesRef.current !== messages) {
      const { keys, ops } = diffMessages(prevKeysRef.current, messages, getKey, keyAliases);
      prevKeysRef.current = keys;
      prevMessagesRef.current = messages;
      for (const op of ops) {
        if (op.type === "swapKey") anchor.rename(op.from, op.to);
        else if (op.type === "reset") {
          const cur = anchor.current;
          if (cur && !keys.includes(cur.key)) anchor.clear();
        }
      }
    }

    // 2) correction — but NEVER against an in-flight, unclassified USER
    // scroll: a commit landing in the write→event gap would erase the user's
    // gesture (see PinController.hasInFlightScroll). User scrolls always have
    // input corroboration — an in-flight displacement WITHOUT intent is a
    // browser clamp and is corrected immediately (waiting would paint one
    // late frame per clamp).
    if (pin.hasInFlightScroll(el.scrollTop) && pin.hasUserIntent()) return;
    if (pin.pinned) {
      const target = el.scrollHeight - el.clientHeight;
      if (el.scrollTop !== target) writeScrollTop(target);
    } else {
      compensateAnchor(el);
    }
  });

  // --- scroll classification (P2) --------------------------------------------
  const reachTopArmedRef = useRef(true);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const source = pin.handleScroll(metrics());
      if (source === "programmatic") return;
      // Real displacement (user or system): what the user sees changed, so the
      // reading-mode reference must follow. Only USER events may change pin
      // state (that already happened inside handleScroll).
      if (!pin.pinned) pickAnchor();
      if (source !== "user") return;
      if (pin.pinned) {
        anchor.clear();
        // P4b: a deferred mode transition applies on repin.
        const want = renderMessagesRef.current.length > thresholdRef.current;
        setWindowed((w) => (w === want ? w : want));
      }
      // onReachTop: edge-triggered entry into the top zone
      if (el.scrollTop <= reachTopRef.current) {
        if (reachTopArmedRef.current) {
          reachTopArmedRef.current = false;
          onReachTopRef.current?.();
        }
      } else {
        reachTopArmedRef.current = true;
      }
    };
    // Input corroboration (P2d): real user scrolls are preceded by these;
    // browser clamps are not.
    const onWheel = () => pin.noteUserInput();
    const onTouch = () => pin.noteUserInput();
    const onKey = () => pin.noteUserInput();
    const onPointerDown = () => pin.beginUserIntent();
    const onPointerUp = () => pin.endUserIntent();
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouch, { passive: true });
    el.addEventListener("touchmove", onTouch, { passive: true });
    el.addEventListener("keydown", onKey);
    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouch);
      el.removeEventListener("touchmove", onTouch);
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [pin, anchor, metrics, pickAnchor]);
  const thresholdRef = useRef(virtualizeThreshold);
  thresholdRef.current = virtualizeThreshold;
  const reachTopRef = useRef(reachTopThreshold);
  reachTopRef.current = reachTopThreshold;

  // Re-arm onReachTop when history actually arrives (prepend grows the list).
  const lastLenRef = useRef(messages.length);
  useEffect(() => {
    if (messages.length > lastLenRef.current) reachTopArmedRef.current = true;
    lastLenRef.current = messages.length;
  }, [messages.length]);

  // --- backstop for non-commit growth (images/fonts) — P1 mechanism note -----
  useEffect(() => {
    const el = scrollerRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const ro = new ResizeObserver(() => {
      if (pin.hasInFlightScroll(el.scrollTop) && pin.hasUserIntent()) return; // P2
      if (pin.pinned) {
        const target = el.scrollHeight - el.clientHeight;
        if (el.scrollTop !== target) writeScrollTop(target);
      } else {
        compensateAnchor(el);
      }
    });
    ro.observe(content);
    ro.observe(el); // viewport resizes change clientHeight → pin target moves
    return () => ro.disconnect();
  }, [pin, compensateAnchor, writeScrollTop]);

  // --- imperative handle ------------------------------------------------------
  useImperativeHandle(
    handleRef,
    (): ChatListHandle => ({
      get pinned() {
        return pin.pinned;
      },
      scrollToBottom() {
        const el = scrollerRef.current;
        if (!el) return;
        pin.setPinned(true);
        anchor.clear();
        writeScrollTop(el.scrollHeight - el.clientHeight);
      },
      async scrollToMessage(key: string) {
        const el = scrollerRef.current;
        if (!el) return false;
        pin.setPinned(false); // API-level reading-mode entry (P2c)
        // Declare the DESIRED invariant up front: row at the viewport top.
        // Commit-time compensation then drives toward the goal on every
        // measurement commit instead of fighting the loop (measured on
        // WebKit/Firefox: an anchor set to the *current* error re-enforced
        // the error each commit and convergence never landed).
        anchor.set(key, 0);
        const nextFrame = () =>
          new Promise<void>((r) => requestAnimationFrame(() => r()));
        // Converge: estimates refine as targets render (windowed mode). Two
        // frames per attempt: one for the engine's scroll-driven re-render,
        // one for measurement commits to land.
        for (let attempt = 0; attempt < 12; attempt++) {
          const offset = anchorDocOffset(key);
          if (offset === null) return false;
          writeScrollTop(offset);
          await nextFrame();
          await nextFrame();
          const node = nodeByKey(key);
          if (node) {
            const err = docOffsetOf(node) - el.scrollTop;
            if (Math.abs(err) <= 1) return true;
            // Bottom-proximate targets can't reach the viewport top — max
            // scroll still leaves them mid-viewport. Clamped + fully visible
            // is success; hold reality instead of an unreachable goal.
            const atMax = el.scrollTop >= el.scrollHeight - el.clientHeight - 1;
            const rect = node.getBoundingClientRect();
            const vp = el.getBoundingClientRect();
            if (atMax && rect.top >= vp.top - 1 && rect.bottom <= vp.bottom + 1) {
              anchor.set(key, err);
              return true;
            }
          }
        }
        return false;
      },
    }),
    [pin, anchor, anchorDocOffset, writeScrollTop, nodeByKey, docOffsetOf],
  );

  // --- render ------------------------------------------------------------------
  return (
    <div
      ref={scrollerRef}
      className={className}
      style={{ ...SCROLLER_STYLE, ...style }}
      data-ancora-mode={windowed ? "windowed" : "flow"}
    >
      {windowed ? (
        <div
          ref={contentRef}
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const msg = messages[item.index];
            if (msg === undefined) return null;
            return (
              <div
                key={item.key}
                data-index={item.index}
                data-ancora-key={renderKeys[item.index]}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${item.start}px)`,
                }}
              >
                {renderMessage(msg, item.index)}
              </div>
            );
          })}
        </div>
      ) : (
        <div ref={contentRef} style={{ width: "100%" }}>
          {messages.map((msg, i) => (
            <div key={renderKeys[i]} data-ancora-key={renderKeys[i]} data-index={i}>
              {renderMessage(msg, i)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

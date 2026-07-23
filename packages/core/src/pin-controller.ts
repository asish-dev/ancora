// The pin state machine (docs/spec/pin-contract.md).
// Pure logic: consumes scroll samples, emits correction targets. The host
// (React adapter) owns WHEN corrections run — the contract requires the
// pinned-correction to execute inside the mutating commit, pre-paint (P1).

import { ExpectedOffsetLedger } from "./ledger";
import type { ScrollMetrics, ScrollSource } from "./types";

export interface PinControllerOptions {
  /** px-from-bottom within which a user scroll repins (P2b). */
  repinThreshold?: number;
  /** Ledger match tolerance in px. */
  ledgerEpsilon?: number;
  /** ms after an input event during which unmatched scrolls count as user. */
  intentWindowMs?: number;
  /** Clock, injectable for tests. */
  now?: () => number;
}

export class PinController {
  private readonly ledger: ExpectedOffsetLedger;
  private readonly repinThreshold: number;
  private readonly intentWindowMs: number;
  private readonly now: () => number;
  private _pinned = true;
  private lastKnownScrollTop = 0;
  private intentUntil = -Infinity; // transient input (wheel/touch/key)
  private intentHeld = 0; // held pointers (scrollbar drag)

  /** Fired on transitions only (P5). */
  onChange: ((pinned: boolean) => void) | null = null;

  constructor(opts: PinControllerOptions = {}) {
    this.repinThreshold = opts.repinThreshold ?? 2;
    this.ledger = new ExpectedOffsetLedger(opts.ledgerEpsilon ?? 1);
    this.intentWindowMs = opts.intentWindowMs ?? 350;
    this.now =
      opts.now ??
      (typeof performance !== "undefined" ? () => performance.now() : () => Date.now());
  }

  /**
   * Transient user input that scrolls (wheel, touchstart/move, nav keys).
   * Unmatched scroll events within the intent window classify as user (P2d).
   */
  noteUserInput(): void {
    this.intentUntil = this.now() + this.intentWindowMs;
  }

  /** A held pointer (scrollbar drag) is continuous intent until released. */
  beginUserIntent(): void {
    this.intentHeld++;
  }

  endUserIntent(): void {
    // Only a release that PAIRS with a begin grants momentum intent. The host
    // listens for releases globally (a scrollbar drag can end anywhere), so an
    // unpaired release — any button click on the page — must grant nothing
    // (measured: a clamp within 350ms of clicking scrollToBottom classified
    // as user and unpinned the list).
    if (this.intentHeld === 0) return;
    this.intentHeld--;
    this.noteUserInput(); // momentum after release still counts briefly
  }

  /**
   * Whether user input that can scroll happened recently (or a pointer is
   * held). Public because the correction path needs it: an in-flight scroll
   * WITHOUT intent cannot be a user scroll — it is a browser clamp and may be
   * corrected immediately instead of waiting a commit (which would paint one
   * late frame per clamp).
   */
  hasUserIntent(): boolean {
    return this.intentHeld > 0 || this.now() < this.intentUntil;
  }

  get pinned(): boolean {
    return this._pinned;
  }

  /**
   * Target scrollTop restoring the pin, or null when no correction is needed.
   * Call inside the mutating commit (useLayoutEffect-equivalent) — P1.
   */
  correction(m: ScrollMetrics): number | null {
    if (!this._pinned) return null;
    const target = m.scrollHeight - m.clientHeight;
    return m.scrollTop !== target ? target : null;
  }

  /**
   * Register a programmatic scrollTop write (correction, compensation,
   * scrollTo). MUST be called for every write the host performs, or the
   * write's scroll event will be misread as a user scroll.
   */
  noteProgrammaticScroll(top: number): void {
    this.ledger.register(top);
    this.lastKnownScrollTop = top;
  }

  /**
   * True when scrollTop differs from the last classified/registered value:
   * a scroll is IN FLIGHT whose event has not yet been classified. Corrections
   * MUST NOT run against it — a commit landing in the write→event gap would
   * read a user's fresh scroll as "deviation", yank the pin back, and the
   * coalesced event would then match the ledger and erase the user's intent
   * entirely (the spike's timestamp-window failure mode, reborn). Wait one
   * commit; the event classifies first.
   */
  hasInFlightScroll(currentScrollTop: number, epsilon = 1): boolean {
    return Math.abs(currentScrollTop - this.lastKnownScrollTop) > epsilon;
  }

  /**
   * Feed every scroll event. Programmatic events never change pin state
   * (P2c). Unmatched events split by input corroboration: with recent user
   * input they are user scrolls — unpin away from bottom (P2a), repin within
   * threshold (P2b); without it they are SYSTEM scrolls (browser clamping when
   * content shrinks under the scroll position) and never change pin state —
   * a clamp misread as a user scroll was measured to spuriously unpin a
   * pinned streaming list within seconds.
   */
  handleScroll(m: ScrollMetrics): ScrollSource {
    const matched = this.ledger.match(m.scrollTop);
    this.lastKnownScrollTop = m.scrollTop;
    if (matched === "programmatic") return "programmatic";
    if (!this.hasUserIntent()) return "system";
    const dist = m.scrollHeight - m.clientHeight - m.scrollTop;
    this.setPinned(dist <= this.repinThreshold);
    return "user";
  }

  /**
   * Explicit API-level state changes (scrollToBottom → pin; scrollToMessage
   * enters reading mode). These are app intent, not scroll-event side effects
   * — the P2 mechanism only guards the scroll-event path.
   */
  setPinned(pinned: boolean): void {
    if (pinned === this._pinned) return;
    this._pinned = pinned;
    this.onChange?.(pinned);
  }
}

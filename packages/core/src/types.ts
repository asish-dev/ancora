// Semantic operations — the internal contract between the differ and the core.
// See docs/spec/operation-inference.md; ADR-0002.

export type Operation =
  /** New items above the existing list. Anchor compensation required. */
  | { type: "prepend"; keys: readonly string[] }
  /** New items below the existing list. No compensation; pin snaps if pinned. */
  | { type: "append"; keys: readonly string[] }
  /**
   * In-place content change with identical key structure (dominant case:
   * the streaming tail grew). Position math unaffected.
   */
  | { type: "growTail" }
  /** Identity swap (optimistic temp id → server id). Anchors must be renamed. */
  | { type: "swapKey"; from: string; to: string }
  /** Items removed; `index` is each key's former index (for compensation). */
  | { type: "remove"; removals: readonly { key: string; index: number }[] }
  /**
   * Structure the differ cannot express exactly (reorder, interleaved insert,
   * duplicate keys). Consumers preserve the anchor BY KEY if it survives.
   */
  | { type: "reset" };

/** Scroll geometry sample — the only thing the core knows about the DOM. */
export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * Where a scroll event came from:
 * - "programmatic": one of OUR registered writes (ledger match).
 * - "user": a real user gesture — unmatched AND corroborated by recent input
 *   events (wheel/touch/key/pointer-held). Only these change pin state.
 * - "system": browser-originated — unmatched with NO input corroboration.
 *   Observed cause: scrollTop clamping when measurements shrink the content
 *   below the current scroll position. Never changes pin state.
 */
export type ScrollSource = "programmatic" | "user" | "system";

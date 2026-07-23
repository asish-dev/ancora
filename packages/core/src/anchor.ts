// Anchor tracking for reading mode (spec P3): the on-screen reference item
// whose position must be preserved across mutations.
//
// The captured position is the anchor's VIEWPORT-RELATIVE top. Compensation
// restores the absolute invariant `docOffset(anchor) - scrollTop == position`,
// i.e. targetScrollTop = docOffset - position. Restoring an absolute target —
// rather than adjusting relative to the current scrollTop — makes compensation
// immune to interleaved scroll adjustments by third parties (measured: the
// engine's own prepend auto-anchoring produced an 823px double-compensation
// under a relative-delta scheme).

export interface AnchorCapture {
  key: string;
  /** Viewport-relative top of the anchor at capture time. */
  position: number;
}

export class AnchorTracker {
  private capture: AnchorCapture | null = null;

  set(key: string, position: number): void {
    this.capture = { key, position };
  }

  get current(): AnchorCapture | null {
    return this.capture;
  }

  /** Apply a swapKey operation so the anchor survives identity swaps (D2a). */
  rename(from: string, to: string): void {
    if (this.capture?.key === from) this.capture = { ...this.capture, key: to };
  }

  /**
   * The scrollTop that puts the anchor back at its captured viewport position,
   * given the anchor's current document offset. Absolute, not relative.
   */
  targetScrollTop(docOffset: number): number | null {
    return this.capture ? docOffset - this.capture.position : null;
  }

  clear(): void {
    this.capture = null;
  }
}

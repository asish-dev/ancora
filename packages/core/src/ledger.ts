// Scroll-source discrimination via expected-offset bookkeeping (spec P2d).
// Every programmatic scrollTop write is registered; each incoming scroll event
// is matched against pending expectations. Timestamp windows are disqualified —
// the spike measured corrections refreshing the window every frame and
// swallowing real user scrolls.

export class ExpectedOffsetLedger {
  private expected: number[] = [];

  /**
   * @param epsilon match tolerance in px — browsers round/clamp writes
   * (fractional zoom, subpixel layout), so exact equality is too strict.
   */
  constructor(private readonly epsilon = 1) {}

  /** Record a programmatic scrollTop write about to happen. */
  register(top: number): void {
    this.expected.push(top);
  }

  /**
   * Classify a scroll event by its observed scrollTop.
   *
   * Browsers coalesce several writes into one event carrying the LAST value,
   * so a match at position i consumes entries 0..i (older writes never get
   * their own event).
   *
   * On a user classification all pending entries are dropped: a user gesture
   * supersedes in-flight expectations, and letting them linger risks a later
   * coincidental match eating a real user scroll.
   */
  match(top: number): "programmatic" | "user" {
    for (let i = 0; i < this.expected.length; i++) {
      if (Math.abs((this.expected[i] as number) - top) <= this.epsilon) {
        this.expected.splice(0, i + 1);
        return "programmatic";
      }
    }
    this.expected.length = 0;
    return "user";
  }

  clear(): void {
    this.expected.length = 0;
  }

  get pending(): number {
    return this.expected.length;
  }
}

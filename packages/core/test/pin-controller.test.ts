// Tests keyed to docs/spec/pin-contract.md P2 (state machine + discrimination).
import { describe, expect, it, vi } from "vitest";
import { PinController } from "../src/pin-controller";
import type { ScrollMetrics } from "../src/types";

const m = (scrollTop: number, scrollHeight = 10_000, clientHeight = 800): ScrollMetrics => ({
  scrollTop,
  scrollHeight,
  clientHeight,
});
const BOTTOM = 10_000 - 800; // 9200

describe("P1 correction", () => {
  it("returns the bottom target while pinned and deviated", () => {
    const pc = new PinController();
    expect(pc.correction(m(9000))).toBe(BOTTOM);
  });

  it("returns null at bottom or when unpinned", () => {
    const pc = new PinController();
    expect(pc.correction(m(BOTTOM))).toBeNull();
    pc.setPinned(false);
    expect(pc.correction(m(9000))).toBeNull();
  });
});

// deterministic injectable clock
const makeClock = () => {
  let t = 0;
  return { now: () => t, tick: (ms: number) => (t += ms) };
};
const userPC = (opts: ConstructorParameters<typeof PinController>[0] = {}) => {
  const clock = makeClock();
  const pc = new PinController({ now: clock.now, ...opts });
  return { pc, clock };
};

describe("P2 scroll-source discrimination", () => {
  it("P2c: a registered programmatic scroll never changes pin state, even far from bottom", () => {
    const pc = new PinController();
    pc.setPinned(false);
    pc.noteProgrammaticScroll(5000);
    expect(pc.handleScroll(m(5000))).toBe("programmatic");
    expect(pc.pinned).toBe(false);

    const pc2 = new PinController();
    pc2.noteProgrammaticScroll(5000); // e.g. anchor compensation while... pinned
    expect(pc2.handleScroll(m(5000))).toBe("programmatic");
    expect(pc2.pinned).toBe(true); // did NOT unpin despite being 4200px from bottom
  });

  it("P2a: an input-corroborated unmatched scroll away from bottom unpins immediately", () => {
    const { pc } = userPC();
    pc.noteUserInput(); // wheel
    expect(pc.handleScroll(m(5000))).toBe("user");
    expect(pc.pinned).toBe(false);
  });

  it("P2b: a corroborated scroll within the repin threshold repins", () => {
    const { pc } = userPC({ repinThreshold: 2 });
    pc.noteUserInput();
    pc.handleScroll(m(5000)); // unpin
    expect(pc.pinned).toBe(false);
    pc.noteUserInput();
    expect(pc.handleScroll(m(BOTTOM - 1))).toBe("user");
    expect(pc.pinned).toBe(true);
  });

  it("SYSTEM: an unmatched scroll with NO input is a browser clamp — pin state untouched", () => {
    const { pc } = userPC();
    // content shrank; browser clamped scrollTop down; no wheel/touch/key happened
    expect(pc.handleScroll(m(5000))).toBe("system");
    expect(pc.pinned).toBe(true); // the measured spurious-unpin bug, prevented
  });

  it("intent expires after the window", () => {
    const { pc, clock } = userPC();
    pc.noteUserInput();
    clock.tick(351);
    expect(pc.handleScroll(m(5000))).toBe("system");
    expect(pc.pinned).toBe(true);
  });

  it("an unpaired pointer release grants NO intent (clicks elsewhere on the page)", () => {
    const { pc } = userPC();
    pc.endUserIntent(); // window-level pointerup from a button click
    expect(pc.handleScroll(m(5000))).toBe("system");
    expect(pc.pinned).toBe(true);
  });

  it("a held pointer (scrollbar drag) is continuous intent until released", () => {
    const { pc, clock } = userPC();
    pc.beginUserIntent(); // pointerdown on scrollbar
    clock.tick(5000); // long drag, no other input events
    expect(pc.handleScroll(m(5000))).toBe("user");
    expect(pc.pinned).toBe(false);
    pc.endUserIntent();
    clock.tick(351); // post-release window elapsed
    expect(pc.handleScroll(m(4000))).toBe("system");
  });

  it("coalesced writes: one event carrying the last value drains older entries", () => {
    const { pc } = userPC();
    pc.noteProgrammaticScroll(100);
    pc.noteProgrammaticScroll(120);
    expect(pc.handleScroll(m(120))).toBe("programmatic");
    // ledger fully drained: the next unmatched (corroborated) event is user
    pc.noteUserInput();
    expect(pc.handleScroll(m(100))).toBe("user");
  });

  it("browser rounding: match within epsilon", () => {
    const pc = new PinController();
    pc.noteProgrammaticScroll(100.4);
    expect(pc.handleScroll(m(100))).toBe("programmatic");
  });

  it("a user scroll clears stale expectations (no later coincidental match)", () => {
    const { pc } = userPC();
    pc.noteProgrammaticScroll(300);
    pc.noteUserInput();
    expect(pc.handleScroll(m(200))).toBe("user"); // user superseded the write
    pc.noteUserInput();
    expect(pc.handleScroll(m(300))).toBe("user"); // stale 300 must NOT match now
  });
});

describe("in-flight scroll guard (the write→event race)", () => {
  it("an unclassified scroll suspends corrections until its event arrives", () => {
    const pc = new PinController();
    pc.noteProgrammaticScroll(BOTTOM); // we know we're at bottom
    expect(pc.hasInFlightScroll(BOTTOM)).toBe(false); // safe to correct

    // user scrolls (wheel); event not yet dispatched:
    pc.noteUserInput();
    expect(pc.hasInFlightScroll(5000)).toBe(true); // corrections must wait

    // the event arrives and classifies as user → unpin, lastKnown updated
    expect(pc.handleScroll(m(5000))).toBe("user");
    expect(pc.pinned).toBe(false);
    expect(pc.hasInFlightScroll(5000)).toBe(false); // classified; safe again
  });

  it("registered writes update the known position (no self-suspension)", () => {
    const pc = new PinController();
    pc.noteProgrammaticScroll(7000);
    expect(pc.hasInFlightScroll(7000)).toBe(false);
    expect(pc.hasInFlightScroll(7000.5)).toBe(false); // sub-epsilon rounding
  });
});

describe("P5 observability", () => {
  it("onChange fires on transitions only", () => {
    const { pc } = userPC();
    const spy = vi.fn();
    pc.onChange = spy;
    pc.noteUserInput();
    pc.handleScroll(m(5000)); // pinned → unpinned
    pc.noteUserInput();
    pc.handleScroll(m(4000)); // stays unpinned
    pc.noteUserInput();
    pc.handleScroll(m(BOTTOM)); // → pinned
    pc.setPinned(true); // no-op
    expect(spy.mock.calls).toEqual([[false], [true]]);
  });
});

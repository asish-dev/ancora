import { describe, expect, it } from "vitest";
import { AnchorTracker } from "../src/anchor";

describe("AnchorTracker", () => {
  it("targetScrollTop restores the absolute viewport invariant", () => {
    const a = new AnchorTracker();
    a.set("m5", 192.5); // anchor sat 192.5px below the viewport top
    // anchor's doc offset moved to 38001 → scrollTop must become 38001-192.5
    expect(a.targetScrollTop(38001)).toBe(37808.5);
    // absolute: the same call is correct no matter what scrollTop drifted to
    expect(a.targetScrollTop(38001)).toBe(37808.5);
  });

  it("targetScrollTop is null with no capture", () => {
    expect(new AnchorTracker().targetScrollTop(123)).toBeNull();
  });

  it("rename follows swapKey so anchors survive identity swaps", () => {
    const a = new AnchorTracker();
    a.set("tmp-1", 100);
    a.rename("tmp-1", "srv-1");
    expect(a.current).toEqual({ key: "srv-1", position: 100 });
    a.rename("other", "x"); // no-op for non-matching keys
    expect(a.current?.key).toBe("srv-1");
  });

  it("clear drops the capture", () => {
    const a = new AnchorTracker();
    a.set("m1", 10);
    a.clear();
    expect(a.current).toBeNull();
  });
});

// Unit tests keyed to docs/spec/operation-inference.md clauses, plus a
// property fuzzer that round-trips random operation compositions.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { inferOperations } from "../src/operations";
import type { Operation } from "../src/types";

const keys = (n: number, prefix = "m") =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe("D3 fast paths", () => {
  it("D3a: identical keys, no content change → no ops", () => {
    const k = keys(5);
    expect(inferOperations(k, [...k]).ops).toEqual([]);
  });

  it("D3a: identical keys + contentChanged → growTail only", () => {
    const k = keys(5);
    expect(inferOperations(k, [...k], { contentChanged: true }).ops).toEqual([
      { type: "growTail" },
    ]);
  });

  it("D3b: empty prev → reset", () => {
    expect(inferOperations([], keys(3)).ops).toEqual([{ type: "reset" }]);
  });

  it("D3c: empty next → reset", () => {
    expect(inferOperations(keys(3), []).ops).toEqual([{ type: "reset" }]);
  });
});

describe("D4 structural inference", () => {
  it("D4a: prepend", () => {
    const prev = keys(5);
    const older = keys(3, "old");
    expect(inferOperations(prev, [...older, ...prev]).ops).toEqual([
      { type: "prepend", keys: older },
    ]);
  });

  it("D4b: append", () => {
    const prev = keys(5);
    const newer = keys(2, "new");
    expect(inferOperations(prev, [...prev, ...newer]).ops).toEqual([
      { type: "append", keys: newer },
    ]);
  });

  it("D4c: mid-list removal with former indices", () => {
    const prev = keys(5); // m0..m4
    const next = ["m0", "m1", "m3", "m4"];
    expect(inferOperations(prev, next).ops).toEqual([
      { type: "remove", removals: [{ key: "m2", index: 2 }] },
    ]);
  });

  it("D4e: prepend + append in one commit (streaming during history load)", () => {
    const prev = keys(4);
    const older = keys(2, "old");
    const newer = keys(1, "new");
    expect(inferOperations(prev, [...older, ...prev, ...newer]).ops).toEqual([
      { type: "prepend", keys: older },
      { type: "append", keys: newer },
    ]);
  });

  it("D4e: prepend + remove + append + growTail composition", () => {
    const prev = keys(4); // m0..m3
    const next = ["old0", "m0", "m2", "m3", "new0"];
    expect(inferOperations(prev, next, { contentChanged: true }).ops).toEqual([
      { type: "prepend", keys: ["old0"] },
      { type: "remove", removals: [{ key: "m1", index: 1 }] },
      { type: "append", keys: ["new0"] },
      { type: "growTail" },
    ]);
  });

  it("D4d: reorder → reset", () => {
    const prev = keys(4);
    const next = ["m1", "m0", "m2", "m3"];
    expect(inferOperations(prev, next).ops).toEqual([{ type: "reset" }]);
  });

  it("D4d: interleaved insert → reset", () => {
    const prev = keys(4);
    const next = ["m0", "m1", "x", "m2", "m3"];
    expect(inferOperations(prev, next).ops).toEqual([{ type: "reset" }]);
  });

  it("D4d: total replacement → reset", () => {
    expect(inferOperations(keys(3), keys(3, "z")).ops).toEqual([
      { type: "reset" },
    ]);
  });
});

describe("D1 identity / D2 aliases", () => {
  it("D1a: duplicate keys → reset + warning", () => {
    const r = inferOperations(["a", "b"], ["a", "b", "b"]);
    expect(r.ops).toEqual([{ type: "reset" }]);
    expect(r.warnings.some((w) => w.includes("duplicate"))).toBe(true);
  });

  it("D2a: alias swap → swapKey, structure preserved", () => {
    const prev = ["m0", "tmp-1"];
    const next = ["m0", "srv-1"];
    const r = inferOperations(prev, next, {
      aliases: new Map([["srv-1", "tmp-1"]]),
    });
    expect(r.ops).toEqual([{ type: "swapKey", from: "tmp-1", to: "srv-1" }]);
    expect(r.warnings).toEqual([]);
  });

  it("D2a: alias swap composes with append", () => {
    const prev = ["m0", "tmp-1"];
    const next = ["m0", "srv-1", "m2"];
    const r = inferOperations(prev, next, {
      aliases: new Map([["srv-1", "tmp-1"]]),
    });
    expect(r.ops).toEqual([
      { type: "swapKey", from: "tmp-1", to: "srv-1" },
      { type: "append", keys: ["m2"] },
    ]);
  });

  it("D2b: tail swap WITHOUT alias → reset-or-remove path + warning", () => {
    const prev = ["m0", "tmp-1"];
    const next = ["m0", "srv-1"];
    const r = inferOperations(prev, next);
    // structurally: tail removed + append at same position → inexpressible
    // contiguously? m0 survives at position 0, so remove+append is exact:
    expect(r.ops).toEqual([
      { type: "remove", removals: [{ key: "tmp-1", index: 1 }] },
      { type: "append", keys: ["srv-1"] },
    ]);
    expect(r.warnings.some((w) => w.includes("keyAliases"))).toBe(true);
  });
});

describe("property: round-trip inference of random compositions", () => {
  // Build next from prev by applying a known random composition, then assert
  // the differ reconstructs exactly that composition (canonical form).
  const arbComposition = fc.record({
    baseSize: fc.integer({ min: 1, max: 40 }),
    prependCount: fc.integer({ min: 0, max: 8 }),
    appendCount: fc.integer({ min: 0, max: 8 }),
    removePct: fc.double({ min: 0, max: 0.5, noNaN: true }),
    seed: fc.integer({ min: 0, max: 1 << 30 }),
    contentChanged: fc.boolean(),
  });

  it("prepend/append/remove compositions are inferred exactly", () => {
    fc.assert(
      fc.property(arbComposition, (c) => {
        const prev = keys(c.baseSize);
        // deterministic pseudo-random removals (never remove everything)
        const rng = mulberry32(c.seed);
        const removed = new Set<string>();
        for (const k of prev) if (rng() < c.removePct) removed.add(k);
        if (removed.size === prev.length) removed.delete(prev[0] as string);

        const surviving = prev.filter((k) => !removed.has(k));
        const pre = keys(c.prependCount, "pre");
        const app = keys(c.appendCount, "app");
        const next = [...pre, ...surviving, ...app];

        const { ops } = inferOperations(prev, next, {
          contentChanged: c.contentChanged,
        });

        // Reconstruct next from prev + inferred ops; must match exactly.
        expect(applyOps(prev, ops, next)).toEqual(next);

        // Canonical composition assertions
        const expectOps: Operation["type"][] = [];
        if (pre.length) expectOps.push("prepend");
        if (removed.size) expectOps.push("remove");
        if (app.length) expectOps.push("append");
        if (c.contentChanged) expectOps.push("growTail");
        expect(ops.map((o) => o.type)).toEqual(expectOps);
      }),
      { numRuns: 500 },
    );
  });

  it("inference never throws and always yields ops that reconstruct next", () => {
    // fully random key arrays, including degenerate structures → reset paths
    const arbKeys = fc.array(
      fc.integer({ min: 0, max: 30 }).map((i) => `k${i}`),
      { maxLength: 30 },
    );
    fc.assert(
      fc.property(arbKeys, arbKeys, (rawPrev, rawNext) => {
        const prev = [...new Set(rawPrev)];
        const next = [...new Set(rawNext)];
        const { ops } = inferOperations(prev, next);
        expect(applyOps(prev, ops, next)).toEqual(next);
      }),
      { numRuns: 500 },
    );
  });
});

/** Reconstruct next from prev + ops. `reset` uses the provided next (by definition). */
function applyOps(
  prev: readonly string[],
  ops: readonly Operation[],
  next: readonly string[],
): readonly string[] {
  let cur = [...prev];
  for (const op of ops) {
    switch (op.type) {
      case "reset":
        return next;
      case "prepend":
        cur = [...op.keys, ...cur];
        break;
      case "append":
        cur = [...cur, ...op.keys];
        break;
      case "remove": {
        const dead = new Set(op.removals.map((r) => r.key));
        cur = cur.filter((k) => !dead.has(k));
        break;
      }
      case "swapKey":
        cur = cur.map((k) => (k === op.from ? op.to : k));
        break;
      case "growTail":
        break;
    }
  }
  return cur;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

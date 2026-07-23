// Operation inference (docs/spec/operation-inference.md).
// Compiles a key-level view of a declarative list change into semantic
// Operations. O(|P| + |N|) — hash lookups only, no LCS (D5).

import type { Operation } from "./types";

export interface InferOptions {
  /**
   * Identity equivalences for optimistic updates: `newKey → previousKey`
   * (server id → temp id). Normalized before diffing (D2a).
   */
  aliases?: ReadonlyMap<string, string> | undefined;
  /** Any surviving message object changed identity (host-computed) → GrowTail (D3a). */
  contentChanged?: boolean | undefined;
}

export interface InferResult {
  ops: Operation[];
  /** Dev diagnostics (D1a duplicate keys, D2b possible optimistic swap). */
  warnings: string[];
}

export function inferOperations(
  prev: readonly string[],
  next: readonly string[],
  opts: InferOptions = {},
): InferResult {
  const warnings: string[] = [];
  const ops: Operation[] = [];

  // D2a — alias normalization. Swaps are emitted first so consumers rename
  // anchors before applying structural ops.
  let n: readonly string[] = next;
  if (opts.aliases && opts.aliases.size > 0) {
    const prevSet = new Set(prev);
    const normalized: string[] = [];
    let changed = false;
    for (const key of next) {
      const canonical = opts.aliases.get(key);
      if (canonical !== undefined && prevSet.has(canonical)) {
        ops.push({ type: "swapKey", from: canonical, to: key });
        normalized.push(canonical);
        changed = true;
      } else {
        normalized.push(key);
      }
    }
    if (changed) n = normalized;
  }

  // D1a — duplicate keys degrade to Reset.
  if (new Set(n).size !== n.length || new Set(prev).size !== prev.length) {
    warnings.push(
      "[ancora] duplicate keys in messages — inference degraded to reset. " +
        "Keys must be unique and stable.",
    );
    ops.push({ type: "reset" });
    return { ops, warnings };
  }

  // D3a — identical structure.
  if (sameKeys(prev, n)) {
    if (opts.contentChanged) ops.push({ type: "growTail" });
    return { ops, warnings };
  }

  // D3b / D3c — empty edges.
  if (prev.length === 0 || n.length === 0) {
    ops.push({ type: "reset" });
    return { ops, warnings };
  }

  // D4 — structural inference.
  const nextIndex = new Map<string, number>();
  n.forEach((key, i) => nextIndex.set(key, i));

  // Removals: prev keys missing from next, with former indices (D4c).
  const removals: { key: string; index: number }[] = [];
  const survivingPositions: number[] = [];
  for (let i = 0; i < prev.length; i++) {
    const key = prev[i] as string;
    const pos = nextIndex.get(key);
    if (pos === undefined) removals.push({ key, index: i });
    else survivingPositions.push(pos);
  }

  // Nothing survived → total replacement (D4d).
  if (survivingPositions.length === 0) {
    ops.push({ type: "reset" });
    return { ops, warnings };
  }

  // Surviving prev items must appear in next in the same order (strictly
  // increasing positions) and contiguously (no interleaved inserts) — else
  // the structure is inexpressible and we Reset (D4d).
  for (let i = 1; i < survivingPositions.length; i++) {
    if ((survivingPositions[i] as number) !== (survivingPositions[i - 1] as number) + 1) {
      ops.push({ type: "reset" });
      return { ops, warnings };
    }
  }

  const blockStart = survivingPositions[0] as number;
  const blockEnd = survivingPositions[survivingPositions.length - 1] as number;

  // D4a / D4b / D4c / D4e — emit in document order.
  if (blockStart > 0) ops.push({ type: "prepend", keys: n.slice(0, blockStart) });
  if (removals.length > 0) {
    ops.push({ type: "remove", removals });
    // D2b — tail-position removal alongside additions smells like an
    // optimistic temp-id→server-id swap without a key alias.
    const tailRemoved = removals.some((r) => r.index === prev.length - 1);
    const added = blockStart > 0 || blockEnd < n.length - 1;
    if (tailRemoved && added) {
      warnings.push(
        "[ancora] a tail message was removed while messages were added — if " +
          "this is an optimistic temp-id → server-id swap, declare it via " +
          "keyAliases so the anchor and pin survive the identity change.",
      );
    }
  }
  if (blockEnd < n.length - 1) ops.push({ type: "append", keys: n.slice(blockEnd + 1) });
  if (opts.contentChanged) ops.push({ type: "growTail" });

  return { ops, warnings };
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

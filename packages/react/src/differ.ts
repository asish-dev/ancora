// The canonical differ (ADR-0002): the ONLY producer of Operations in v1.
// Wraps @ancora/core's inferOperations with key extraction and once-per-issue
// dev diagnostics.

import { inferOperations, type Operation } from "@ancora/core";

// Bundlers statically replace process.env.NODE_ENV; this keeps the package
// free of @types/node while remaining tree-shakeable in production builds.
declare const process: { env: { NODE_ENV?: string } };

export interface DiffResult {
  keys: string[];
  ops: Operation[];
}

const warned = new Set<string>();
function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  // eslint-disable-next-line no-console
  console.warn(message);
}

export function diffMessages<M>(
  prevKeys: readonly string[],
  next: readonly M[],
  getKey: (message: M, index: number) => string,
  aliases?: ReadonlyMap<string, string>,
): DiffResult {
  const keys = next.map((m, i) => getKey(m, i));
  const { ops, warnings } = inferOperations(prevKeys, keys, { aliases });
  if (process.env.NODE_ENV !== "production") {
    for (const w of warnings) warnOnce(w);
  }
  return { keys, ops };
}

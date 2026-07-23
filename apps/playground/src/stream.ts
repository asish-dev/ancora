// Fake streaming conversation generator.
// Produces mixed-height messages resembling an AG-UI/AI-chat event stream:
// short user turns, long streaming assistant turns, tall tool-call blocks.

export type MessageType = "user" | "assistant" | "tool_call";

export interface Message {
  id: string;
  type: MessageType;
  content: string;
  /** true while tokens are still being appended */
  streaming?: boolean;
}

const LOREM =
  `the virtualizer must hold the bottom pin pixel stable while the tail message grows
every frame because token streaming changes the height of the last item constantly
and any correction that lands a frame late is visible to the user as jitter which is
exactly the failure mode that makes people abandon hand rolled solutions the prepend
path is the second hard case because loading older history shifts every offset and
the anchor item must not move on screen even in safari where scroll anchoring does
not apply to absolutely positioned children measured sizes replace estimates late
which causes secondary drift that naive implementations never compensate for`.split(
    /\s+/,
  );

let word = 0;
export function nextTokens(n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) {
    out += LOREM[word % LOREM.length] + " ";
    word++;
  }
  return out;
}

let idCounter = 0;
export const nextId = () => `m${++idCounter}`;

function toolCallBody(seed: number): string {
  return JSON.stringify(
    {
      type: "TOOL_CALL_END",
      toolCallId: `call_${seed}`,
      toolName: seed % 2 ? "create_segment" : "query_users",
      args: {
        filters: Array.from({ length: 2 + (seed % 4) }, (_, i) => ({
          field: ["last_seen", "app_version", "ltv", "city"][i % 4],
          op: ["gt", "eq", "in"][i % 3],
          value: `v${seed}_${i}`,
        })),
      },
      result: { matched: 1000 + seed * 7, tookMs: 12 + (seed % 40) },
    },
    null,
    2,
  );
}

export function makeMessage(seed: number): Message {
  const r = seed % 7;
  if (r === 0)
    return { id: nextId(), type: "tool_call", content: toolCallBody(seed) };
  if (r % 2 === 1)
    return { id: nextId(), type: "user", content: nextTokens(4 + (seed % 12)) };
  return {
    id: nextId(),
    type: "assistant",
    content: nextTokens(15 + ((seed * 13) % 120)),
  };
}

export function makeHistory(count: number, seedOffset = 0): Message[] {
  return Array.from({ length: count }, (_, i) => makeMessage(i + seedOffset));
}

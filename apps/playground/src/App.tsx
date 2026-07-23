// Playground = dev tool AND e2e fixture. It measures the library strictly
// FROM OUTSIDE (independent rAF sampler over the real DOM) — the library's own
// bookkeeping is never trusted by the gates.
//
// URL params:
//   ?count=N      initial history size (default 300)
//   ?threshold=N  virtualizeThreshold (default 100)
//   ?stream=0     start with streaming paused
//   ?naive=1      naive list with NO correction — canary proving the sampler
//                 detects real deviation (guards against a lying instrument).
//                 (named "naive" because ?raw is a reserved Vite import query)
//   ?autoload=1   wire onReachTop → auto-prepend
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ChatList, type ChatListHandle } from "@ancora/react";
import { makeHistory, makeMessage, nextId, nextTokens, type Message } from "./stream";

const params = new URLSearchParams(location.search);
const INITIAL_COUNT = Number(params.get("count") ?? 300);
const THRESHOLD = Number(params.get("threshold") ?? 100);
const START_STREAMING = params.get("stream") !== "0";
const RAW_MODE = params.get("naive") === "1";
const AUTOLOAD = params.get("autoload") === "1";

const STREAM_INTERVAL_MS = 30;
const TOKENS_PER_TICK = 2;
const TOKENS_PER_MESSAGE = 90;
const WARMUP_FRAMES = 90;
const JITTER_PX = 1.5;

const ESTIMATES: Record<Message["type"], number> = {
  user: 56,
  assistant: 120,
  tool_call: 340,
};

let historySeed = 10_000;

interface Sample {
  fps: number;
  deviationNow: number;
  maxDeviation: number;
  jitterFrames: number;
  framesMeasured: number;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>(() => {
    const h = makeHistory(INITIAL_COUNT);
    h.push({ id: nextId(), type: "assistant", content: "", streaming: true });
    return h;
  });
  const [streaming, setStreaming] = useState(START_STREAMING);
  const [pinned, setPinned] = useState(true);
  const [sample, setSample] = useState<Sample | null>(null);
  const [mode, setMode] = useState("—");
  const handle = useRef<ChatListHandle | null>(null);
  const tokensInCurrent = useRef(0);

  // --- streaming driver (spike-identical cadence) ----------------------------
  useEffect(() => {
    if (!streaming) return;
    const t = setInterval(() => {
      setMessages((prev) => {
        const next = prev.slice();
        const last = next[next.length - 1];
        if (last?.type === "assistant" && last.streaming) {
          tokensInCurrent.current += TOKENS_PER_TICK;
          if (tokensInCurrent.current >= TOKENS_PER_MESSAGE) {
            tokensInCurrent.current = 0;
            next[next.length - 1] = { ...last, streaming: false };
            if (Math.random() < 0.3) {
              next.push(makeMessage(Math.floor(Math.random() * 1000) * 7));
            }
            next.push({
              id: nextId(),
              type: "user",
              content: nextTokens(5 + Math.floor(Math.random() * 10)),
            });
            next.push({ id: nextId(), type: "assistant", content: "", streaming: true });
          } else {
            next[next.length - 1] = {
              ...last,
              content: last.content + nextTokens(TOKENS_PER_TICK),
            };
          }
        }
        return next;
      });
    }, STREAM_INTERVAL_MS);
    return () => clearInterval(t);
  }, [streaming]);

  const prepend = useCallback(() => {
    setMessages((prev) => {
      const older = makeHistory(20, historySeed);
      historySeed += 20;
      return older.concat(prev);
    });
  }, []);

  // --- independent instrument: rAF sampler over the real DOM -----------------
  const pinnedRef = useRef(true);
  useEffect(() => {
    const stats = {
      frames: 0,
      jitter: 0,
      max: 0,
      warmup: WARMUP_FRAMES,
      fpsFrames: 0,
      fpsLast: performance.now(),
      fps: 0,
    };
    let raf = 0;
    let lastPush = 0;
    const loop = (now: number) => {
      const el = document.querySelector<HTMLElement>(".ancora-scroller, .raw-scroller");
      stats.fpsFrames++;
      if (now - stats.fpsLast >= 1000) {
        stats.fps = Math.round((stats.fpsFrames * 1000) / (now - stats.fpsLast));
        stats.fpsFrames = 0;
        stats.fpsLast = now;
      }
      let deviation = 0;
      if (el) {
        if (stats.warmup > 0) stats.warmup--;
        else if (pinnedRef.current) {
          deviation = el.scrollHeight - el.clientHeight - el.scrollTop;
          stats.frames++;
          const abs = Math.abs(deviation);
          if (abs > stats.max) stats.max = abs;
          if (abs > JITTER_PX) stats.jitter++;
        }
        setMode(el.dataset["ancoraMode"] ?? (RAW_MODE ? "raw" : "—"));
      }
      if (now - lastPush > 200) {
        lastPush = now;
        setSample({
          fps: stats.fps,
          deviationNow: Number(deviation.toFixed(2)),
          maxDeviation: Number(stats.max.toFixed(2)),
          jitterFrames: stats.jitter,
          framesMeasured: stats.frames,
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const onPinChange = useCallback((p: boolean) => {
    pinnedRef.current = p;
    setPinned(p);
  }, []);

  const jitterRatio =
    sample && sample.framesMeasured > 0
      ? sample.jitterFrames / sample.framesMeasured
      : 0;

  return (
    <div className="app">
      <header>
        <h1>ancora playground</h1>
        <span className="sub">
          {RAW_MODE ? "RAW (no correction — instrument canary)" : "@ancora/react"} ·
          streaming @ {STREAM_INTERVAL_MS}ms · threshold {THRESHOLD}
        </span>
      </header>
      <div className="columns">
        <div className="list-shell">
          {RAW_MODE ? (
            <RawList messages={messages} />
          ) : (
            <ChatList<Message>
              className="ancora-scroller scroller"
              messages={messages}
              getKey={(m) => m.id}
              estimateSize={(m) => ESTIMATES[m.type]}
              virtualizeThreshold={THRESHOLD}
              onPinChange={onPinChange}
              {...(AUTOLOAD ? { onReachTop: prepend } : {})}
              handleRef={handle}
              renderMessage={(m, i) => <MessageView msg={m} index={i} />}
            />
          )}
          {!pinned && !RAW_MODE && (
            <button className="repin" onClick={() => handle.current?.scrollToBottom()}>
              ↓ back to live
            </button>
          )}
        </div>
        <aside className="panel">
          <section>
            <h2>controls</h2>
            <button data-testid="toggle-stream" onClick={() => setStreaming((s) => !s)}>
              {streaming ? "pause stream" : "resume stream"}
            </button>
            <button data-testid="prepend" onClick={prepend}>
              prepend 20 older
            </button>
            <button
              data-testid="scroll-random"
              onClick={() => {
                // 10–50% depth: always reachable for align-start on every engine
                const target =
                  messages[Math.floor(messages.length * (0.1 + Math.random() * 0.4))];
                if (target) void handle.current?.scrollToMessage(target.id);
              }}
            >
              scrollTo random msg
            </button>
            <button data-testid="scroll-bottom" onClick={() => handle.current?.scrollToBottom()}>
              scrollToBottom
            </button>
          </section>
          <section>
            <h2>runtime</h2>
            <Metric label="fps" value={sample?.fps ?? "—"} />
            <Metric label="messages" value={messages.length} />
            <Metric label="mode" value={mode} />
            <Metric label="pin state" value={pinned ? "PINNED" : "unpinned"} />
          </section>
          <section>
            <h2>pin stability (external sampler)</h2>
            <Metric label="deviation now" value={`${sample?.deviationNow ?? 0}px`} />
            <Metric label="max deviation" value={`${sample?.maxDeviation ?? 0}px`} />
            <Metric
              label="jitter frames (>1.5px)"
              value={`${sample?.jitterFrames ?? 0} / ${sample?.framesMeasured ?? 0} (${(
                jitterRatio * 100
              ).toFixed(2)}%)`}
            />
            <p className="hint">
              measured by an rAF sampler outside the library; warmup {WARMUP_FRAMES} frames excluded
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** Canary: same stream, no library, no correction. The sampler MUST show runaway deviation here. */
function RawList({ messages }: { messages: readonly Message[] }) {
  return (
    <div className="raw-scroller scroller" style={{ overflowAnchor: "none" }}>
      {messages.map((m, i) => (
        <div key={m.id} data-index={i}>
          <MessageView msg={m} index={i} />
        </div>
      ))}
    </div>
  );
}

function MessageView({ msg, index }: { msg: Message; index: number }) {
  if (msg.type === "tool_call") {
    return (
      <div className="row">
        <div className="bubble tool">
          <div className="meta">#{index} · TOOL_CALL</div>
          <pre>{msg.content}</pre>
        </div>
      </div>
    );
  }
  return (
    <div className="row">
      <div className={`bubble ${msg.type}`}>
        <div className="meta">
          #{index} · {msg.type}
          {msg.streaming ? " · streaming…" : ""}
        </div>
        <p>{msg.content}</p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span className="k">{label}</span>
      <span className="v">{value}</span>
    </div>
  );
}

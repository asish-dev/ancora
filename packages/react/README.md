# @ancora/react

**Pixel-stable virtualized message list for AI chat and streaming logs.** The
MIT alternative to react-virtuoso's commercial `VirtuosoMessageList`.

Two guarantees, enforced by a cross-engine CI gate (Chromium, WebKit, Firefox):

1. **The bottom pin never wobbles while tokens stream.** The last message can
   grow every frame; the list bottom stays glued to the viewport bottom —
   0 jitter frames.
2. **Reading mode is sacred.** Once you scroll up, nothing on screen moves — not
   for prepended history, not for streaming below the fold, not for late size
   measurement — 0px shift.

It virtualizes only when it needs to: short conversations render as normal DOM
(find-in-page, text selection, and screen readers just work), and switch to
windowing above a threshold, invisibly.

```bash
npm install @ancora/react @tanstack/react-virtual
```

`react`, `react-dom` (18 or 19) and `@tanstack/react-virtual` are peer
dependencies. TanStack Virtual is an internal engine — you never import or
configure it; it is a peer only so a single copy is shared with the rest of
your app.

## Quick start

```tsx
import { ChatList } from "@ancora/react";

type Msg = { id: string; role: "user" | "assistant"; text: string };

export function Chat({ messages }: { messages: Msg[] }) {
  return (
    <ChatList<Msg>
      messages={messages}
      getKey={(m) => m.id}
      renderMessage={(m) => (
        <div className={`bubble ${m.role}`}>{m.text}</div>
      )}
      style={{ height: "100%" }}
    />
  );
}
```

That's the whole integration. Append a message and the pin follows it; push
tokens onto the last message and the bottom stays put. `<ChatList>` owns the
scroll container, so give it a bounded height (via `style`/`className`) and let
it fill that space.

> **The one rule: keys must be stable.** `getKey` must return the same string
> for the same logical message on every render. Ancora anchors the viewport by
> key; index-based or content-based keys will break pin and scroll restoration.
> In development it warns when it detects unstable keys.

## How it decides to virtualize

| Messages | Mode | Behavior |
| --- | --- | --- |
| ≤ `virtualizeThreshold` (default 100) | **Flow** | Plain DOM. Native find-in-page, selection, a11y. |
| > threshold | **Windowed** | Only visible rows are mounted. |

The switch happens only at safe moments (while pinned, or deferred until you
scroll back to the bottom), so you never see it. Behavior is identical in both
modes — the mode is an implementation detail, not something your UI reacts to.

## Streaming with the AI SDK (`useChat`)

Ancora takes a plain array, so `useChat` needs no glue:

```tsx
import { useChat } from "@ai-sdk/react";
import { ChatList } from "@ancora/react";

export function Assistant() {
  const { messages } = useChat();
  return (
    <ChatList
      messages={messages}
      getKey={(m) => m.id}
      renderMessage={(m) => <Message message={m} />}
      style={{ height: "100dvh" }}
    />
  );
}
```

Every streamed token gives `messages` a new identity; ancora diffs it, sees the
tail grew, and holds the pin — no refs, no scroll callbacks.

## Loading older history (infinite scroll up)

`onReachTop` fires once when a user scroll enters the top zone. Prepend older
messages and the anchor the reader is looking at stays fixed to the pixel:

```tsx
<ChatList
  messages={messages}
  getKey={(m) => m.id}
  renderMessage={renderMessage}
  onReachTop={() => loadOlder()}     // prepend to `messages`
  reachTopThreshold={400}            // px from top that arms it (default 200)
/>
```

It re-arms only after history actually arrives, so a single scroll can't fire
it twice.

## A "scroll to latest" button

Ancora ships no UI. Build the chip yourself from the pin state:

```tsx
import { useRef, useState } from "react";
import { ChatList, type ChatListHandle } from "@ancora/react";

function Chat({ messages }) {
  const list = useRef<ChatListHandle>(null);
  const [pinned, setPinned] = useState(true);
  return (
    <div style={{ position: "relative", height: "100%" }}>
      <ChatList
        handleRef={list}
        messages={messages}
        getKey={(m) => m.id}
        renderMessage={renderMessage}
        onPinChange={setPinned}
        style={{ height: "100%" }}
      />
      {!pinned && (
        <button onClick={() => list.current?.scrollToBottom()}>
          ↓ Latest
        </button>
      )}
    </div>
  );
}
```

## Optimistic sends (temp id → server id)

When you send a message optimistically with a temporary id and later swap in the
server id, tell ancora the two ids are the same message via `keyAliases`
(`newKey → previousKey`). It treats the change as an identity swap instead of a
remove-and-append, so pin and anchor survive:

```tsx
<ChatList
  messages={messages}
  getKey={(m) => m.id}
  keyAliases={new Map([[serverId, tempId]])}
  renderMessage={renderMessage}
/>
```

Without an alias, ancora still behaves correctly but warns in development that a
swap looked like a delete + insert.

## Props

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `messages` | `readonly M[]` | — | Your message array (any shape). |
| `getKey` | `(m, i) => string` | — | **Stable** unique id per message. |
| `renderMessage` | `(m, i) => ReactNode` | — | Renders one message. |
| `onPinChange` | `(pinned: boolean) => void` | — | Fires on pin/unpin transitions. |
| `onReachTop` | `() => void` | — | Fires when a user scroll reaches the top zone. |
| `virtualizeThreshold` | `number` | `100` | Message count above which windowing turns on. |
| `estimateSize` | `(m, i) => number` | `100` | Row height estimate (windowed mode) before measurement. Rough is fine; a per-type estimate reduces first-paint correction. |
| `keyAliases` | `ReadonlyMap<string,string>` | — | `newKey → previousKey` identity equivalences. |
| `repinThreshold` | `number` | `2` | px from bottom within which scrolling repins. |
| `reachTopThreshold` | `number` | `200` | px from top that arms `onReachTop`. |
| `handleRef` | `Ref<ChatListHandle>` | — | Imperative handle (below). |
| `className` / `style` | | | Applied to the scroll container. |

### Imperative handle

```ts
interface ChatListHandle {
  readonly pinned: boolean;              // current pin state
  scrollToBottom(): void;                // scroll to bottom and pin
  scrollToMessage(key: string): Promise<boolean>; // align a message to the top;
                                         // resolves true when within 1px
}
```

## Styling

Ancora styles nothing except the layout it must own (the scroll container's
overflow and scroll anchoring). Your `renderMessage` output is entirely yours.
Give the component a bounded height; internal rows are laid out by the engine —
don't add margins that collapse between rows in windowed mode (use padding
inside your bubble instead).

## Browser support

| Environment | Status |
| --- | --- |
| Chrome / Chromium, Safari / WebKit, Firefox (desktop) | ✅ certified — CI gate: 0 jitter frames, 0px anchor shift |
| iOS Safari | ⚠️ not yet certified (momentum + rubber-banding differ from desktop WebKit) — targeted for a follow-up release |

## License

MIT © Asish Samanta

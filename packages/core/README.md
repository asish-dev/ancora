# @ancora/core

Framework-agnostic core behind [ancora](https://github.com/asish-dev/ancora) —
the pixel-stable virtualized message list for AI chat and streaming logs.

**Most people want [`@ancora/react`](https://www.npmjs.com/package/@ancora/react),
not this package.** `@ancora/core` is the headless engine: pure logic, no DOM,
no framework. Use it directly only if you are building an ancora adapter for
another framework (Vue, Svelte, Solid, …).

```bash
npm install @ancora/core
```

## What's inside

| Export | Responsibility |
| --- | --- |
| `PinController` | The pin/unpin state machine and scroll-source discrimination (user vs programmatic vs browser-clamp). Consumes scroll metrics + input signals; tells the host when to correct. |
| `AnchorTracker` | Reading-mode anchor math: capture a reference item and compute the absolute scroll target that keeps it stationary across mutations. |
| `ExpectedOffsetLedger` | Records programmatic scroll writes so their resulting scroll events aren't misread as user intent. |
| `inferOperations` | Compiles a change of the message-key array into semantic operations (`prepend`, `append`, `growTail`, `swapKey`, `remove`, `reset`). |

## Contract

An adapter drives the core from its framework's pre-paint commit phase
(`useLayoutEffect` in React): feed scroll events and input signals into
`PinController`, ask it for a correction, and apply that scroll write inside the
same commit — before paint. This timing is the whole game; correcting a frame
late (rAF / ResizeObserver) reintroduces the jitter the library exists to
remove.

See the [pin contract](https://github.com/asish-dev/ancora/blob/main/docs/spec/pin-contract.md)
and [operation-inference spec](https://github.com/asish-dev/ancora/blob/main/docs/spec/operation-inference.md)
for the precise, testable behavior.

## License

MIT © Asish Samanta

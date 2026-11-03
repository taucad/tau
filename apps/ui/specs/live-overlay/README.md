# Live overlay presentation

`LiveOverlay.tla` checks the one chunk stream a watched run presents to the AI SDK when durable rows and the live preview both feed it.

`packages/agent-host/specs/SeamDelivery.tla` proves the projection applies durable rows as a prefix of the log. It does not model the live preview, which arrives on its own subscription and is appended to the same stream. The host makes a step's tool results durable before the next model request starts. The page reads the two channels independently, though, so the next step's live reasoning can be presented before those results are folded.

A durable tool result projects as its output, then `finish-step` and `start-step`. The SDK reducer forgets its active text and reasoning parts on `finish-step` without closing them, and it rejects the next delta of a forgotten part. The watch stream then errors. Tool results folded after that never reach the page, so their calls keep spinning until the step ends and the transcript is materialized again.

| Configuration               | Expect                         | Meaning                                                           |
| --------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| `target`                    | pass                           | `GuardBoundary`: no step boundary while a live block is open      |
| `today-StreamAccepted`      | violates `StreamAccepted`      | As-built: the SDK rejects the reasoning delta after the boundary  |
| `today-FoldedToolConcluded` | violates `FoldedToolConcluded` | As-built: later results are folded but their calls never conclude |

## Correspondence to implementation

| Model                               | Runtime seam                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `FoldOutput`                        | `foldLiveRow` → `projectAgentHostEvent` `tool-output` in `app/services/agent-host-event-projection.ts` |
| `Boundary`, `GuardBoundary`         | `hasOpenStreamBlock`: an open text or reasoning block holds back the result's step boundary            |
| `LiveStart`, `LiveDelta`, `LiveEnd` | `reduceChatProjection` `live` → `projectAgentHostLiveEvent` `thinking-*`                               |
| `active`, `errored`, `shown`        | `openRunWatch` drain → the SDK's `processUIMessageStream`                                              |

The `paused` lifecycle row already keeps the same rule through `hasOpenBlock`. The regression tests are in `app/machines/chat-projection.logic.test.ts` under "durable tool results read after the next step went live".

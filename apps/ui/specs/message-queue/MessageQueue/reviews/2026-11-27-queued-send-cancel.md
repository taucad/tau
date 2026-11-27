Moved from the notes above `EXTENDS` in `MessageQueue.tla` by `formal review-notes`.

```text
Queued send cancelled before it is queued (2026-11-27): `requestTurn` takes an abort signal. A send cancelled before
its queue write is never written; one cancelled during the write is removed again under the queue's lock before the
queue is woken, as an unsent entry's removal. The message never enters `Queue`, so it is the model's not-yet-sent
composer text. No action or verdict changes.
```

```sha256
68fafe3a26f23b5f35079fb93681cb083e4b56e33a2221b5086ee716c7a48cf7  apps/ui/app/chat-clients/use-cad-chat-client.ts
7affee504c879ec5a34c175360dc71ff7ce05e94407a6da9dfd8b4b946a1fd91  apps/ui/app/hooks/use-chat.tsx
18c37ded8ed9b8102dc0d540bbdc71e6e1383e55686b311ac38615abfbdc8a9e  apps/ui/app/services/chat-session-store.ts
```

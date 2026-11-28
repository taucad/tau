A send the composer replays with an abort signal and cancels after its queue write (staging re-check 7).

```text
Composer cancel after the queue write (2026-11-28): the write is the outbox's as soon as it lands, and its watcher
can start delivery before `requestTurn` reads its signal again. That cancel no longer removes the entry with a plain
record update (which raced a delivery holding the delivery lock: the send still went, or failed as "no longer
available"). It takes the send back the way Stop does: the departing send is withdrawn (`withdrawTurn` while it is
admitting) and its entry dropped under the delivery lock while it is unsent; an entry still queued behind other work
is removed under the delivery lock while unsent, as an unsent entry's removal. Past that the send is delivered as
before and the composer is told it went (`queuedSendOutcome`), so the page never says it was cancelled. Both paths
are the model's existing withdraw and unsent-removal steps; nothing is offered back, since the composer kept the
text. A refused send kept in the outbox names no reason in the strip (the chat's failure region says it, once), and
the strip's notice is not an alert while that region shows the failure: presentation only. No action or verdict
changes.
```

```sha256
cdfa7493e4da37184e8102c9b3b4cb601588a1c4955884bdb9740cfc4966ac3d  apps/libs/chat-ui/src/components/chat-message-queue-view.tsx
40e2fdbf5d6e1fcd8814720798b77af095175f6e9d5c14b5718591e3811844d1  apps/ui/app/components/chat/chat-message-queue.tsx
0b60ee2f8dc98aa8ee1ad81470c36e2b94d6f947768565b3ee086646e6be97ed  apps/ui/app/services/chat-session-store.ts
```

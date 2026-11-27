Phone composer box and a silent queued send during an open.

The composer adopts a served input only into a live draft actor, waiting a render when its session was disposed under a
suspended boundary, so the text reaches the draft before any send. A send queued while the project opens is no longer
announced (only its cancellation is), and a replayed queued send no longer locks the editor, so Escape and typing reach
the draft. Presentation and input ownership only: the message never enters `Queue` until it is sent. No action or
verdict changes.

```sha256
b9a3839922a621107c96dc58bec8ade972d373c34539bb56d176507eb3dda9b9  apps/ui/app/components/chat/chat-textarea.tsx
```

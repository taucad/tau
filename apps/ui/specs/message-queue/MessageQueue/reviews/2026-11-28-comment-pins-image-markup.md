Comment pins S5 and S6 (image mark up).

```text
Comment pins S5 review (2026-11-28): an edit's comments also reach the host's edited transcript (`chat-turn-host.tsx`),
a draft loaded into the composer keeps its comments in the composer record (`chat-session-store.ts`), and the composer
opens image mark up (`chat-textarea.tsx`). Comments travel inside the
message as before; nothing here enqueues, delivers, persists or cancels differently. No action or verdict changes.
```

```sha256
510ba16659e8e911bb799579d8d3adeb2ce47364b4e0445b97e0847af6dd5be9  apps/ui/app/chat-clients/chat-turn-host.tsx
bfab846f5a1805c41fab83e8e7010dec6949531129cfc46f7169e13c68bf122d  apps/ui/app/components/chat/chat-textarea.tsx
fa2c8eaf6b31453d8d552554234cc62aa0a06ca79c0e7ba9c0ccf7d76d3faca4  apps/ui/app/services/chat-session-store.ts
```

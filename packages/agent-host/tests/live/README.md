# Agent host live acceptance

Run the uncached provider stream matrix explicitly:

```bash
TAU_AGENT_LIVE_GATEWAY_URL=https://api.example/ \
TAU_AGENT_LIVE_BEARER=... \
TAU_AGENT_LIVE_PROVIDERS=openai,anthropic,vertexai,xai \
pnpm nx run agent-host:test:live
```

`TAU_AGENT_LIVE_PROVIDERS` is required and accepts `openai`, `anthropic`,
`vertexai`, and `xai`. Override a current catalog route with
`TAU_AGENT_LIVE_<PROVIDER>_MODEL`. The suite fails when a selected credential,
provider, model, reasoning stream, or tool-input stream is unavailable. It is
outside ordinary `src/**/*.test.ts` discovery and never records credentials or
unbounded provider output.

The gateway and bearer also accept the existing daemon aliases
`TAU_HOST_GATEWAY_URL` and `TAU_HOST_LIVE_BEARER`. Each selected row performs a
real streamed tool turn, verifies durable reasoning/tool output, closes and
reopens the Node log, and makes a second provider call from the restored history.

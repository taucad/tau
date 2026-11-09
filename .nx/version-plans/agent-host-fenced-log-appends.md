---
agent-host: minor
---

`@taucad/agent-host` fences a provider event log's appends at the authority (D23). `ProviderEventLogOptions['fileSystem']` takes an optional `appendFileFenced(path, data, { expectedLength })`; when present each append passes the length the writer checked under its lock, and an `EAPPENDSTALE` or `EFENCED` refusal fences the writer with `LOG_FENCED` without rolling back, so a racing writer's bytes are kept.

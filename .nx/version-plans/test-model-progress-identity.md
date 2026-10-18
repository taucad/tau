---
cli: minor
host: minor
mcp: minor
---

`test_model` reports progress over MCP and names the engine and the runtime that decided it.

- `@taucad/mcp` passes the client's progress reporter to the four CAD tools as it does to host tools. Over `tau mcp`, a `test_model` call whose client sent a `progressToken` receives one `notifications/progress` as the run starts (`progress` 0, naming how many GeoSpec files it runs) and one as each test starts (`progress` counting the tests started, the message naming the requirement and its file).
- `test_model` results carry `engine`, the GeoSpec engine that decided their claims as its `initialize` answer names it (`name`, `version`, `protocol`, `numericProfile`, `qualification`), wherever `@taucad/host` runs them on its native engine. Over `tau mcp` they also carry `runtime`: the serving CLI's `version` and, when the agent plugin started it, `launch`, its parsed `TAU_LAUNCH` descriptor. A shortened report keeps both.

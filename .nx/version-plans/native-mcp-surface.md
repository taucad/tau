---
runtime: minor
host: minor
mcp: minor
cli: minor
agent-plugin: minor
---

`tau mcp` composes the native kernels from the payload store. A `.py` or `.cs` file whose kernel is not prepared answers the new `KERNEL_NOT_PREPARED` issue, naming the kernel, the bytes preparing downloads and the exact `prepare_kernel` call; the new `prepare_kernel` tool prepares it in the server's process with `notifications/progress` and cancellation, and the server picks up a kernel another process prepared without a second call. Runtime threads get an allowlisted environment. `@taucad/mcp` forwards progress from host tools, and the agent plugin forwards the proxy, CA and managed-profile variables and sets `NODE_USE_ENV_PROXY=1` when a proxy is set.

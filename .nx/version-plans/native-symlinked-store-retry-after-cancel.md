---
host: minor
runtime: minor
cli: minor
---

`tau serve` launches native workers from a payload store reached through a symbolic link, such as one under macOS's `/tmp` or a linked home or `TAU_CONFIG_DIR`. Previously every brokered launch was refused with "is not a closure sealed in the payload store". `RuntimeChildNativeKernels` gains a required `store`: the broker resolves it to its real path once per child and compares real paths on both sides. A launch is still refused when its closure's real path leaves the store, when it is not sealed, or when it names the closure through a link the daemon never composed. `tau serve` and `tau mcp` now compose closures by the store's real path, because the native sandbox cannot start a worker spelled through a link such as `/tmp`.

A preparation called right after every caller of an attempt cancelled now starts a fresh attempt instead of joining the one being cancelled and answering `cancelled` too. The cancelled attempt reports nothing more once a newer attempt for the same selection has started.

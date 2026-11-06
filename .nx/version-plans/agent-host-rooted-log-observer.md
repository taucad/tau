---
agent-host: minor
---

`@taucad/agent-host/browser` exports `createRootedLogObserver(projectRoot)`, the `observeLog` that `createBrowserChatStore` takes, built over a rooted project filesystem. It observes a chat log in the change-set form, so a peer's append storm arrives once per committed changeset. It falls back to the per-path watch when the source answers `ENOTSUP`. The browser agent host now uses it instead of an inline copy.

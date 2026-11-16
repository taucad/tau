---
host: patch
---

An ACP permission choice of kind `allow_once` or `reject_once` is now recorded with requested scope `once` for every adapter, not only for the reviewed Codex and Grok ones. A Claude Code "Allow" is therefore shown as allowed once instead of "saving unverified". What an `allow_always` saves is still claimed only for reviewed adapters.

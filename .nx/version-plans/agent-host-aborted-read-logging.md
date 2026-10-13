---
agent-host: patch
---

The browser leadership binding no longer reports a read its reader aborted as a failure. A forwarded read that ends because this tab stopped leading, or because its bound passed, is logged at debug instead of as an error. A local read whose reader let go is logged at debug and rejects with that abort, as a read served by the launcher itself does, instead of answering an `owner-fenced` refusal. A reader that lets go of a read forwarded to another tab now gets that abort too, rather than a read that never settles and an unhandled rejection. A read that fails for any other reason is still logged as an error and refused.

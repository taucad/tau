---
filesystem: patch
---

`ProviderRegistry` keeps its node filesystem channel when the host fails to answer `describe`. Before, the failed ask dropped the shared channel without closing it: the next resolution opened a second channel, the first stayed open, and its close no longer evicted the providers still bound to it. Now only a failed open drops the channel, and the next resolution asks the same channel again.

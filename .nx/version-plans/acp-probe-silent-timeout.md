---
host: patch
---

A CLI probe that reaches its time budget and exits cleanly without printing a version is now refused as `EXTERNAL_AGENT_UNAVAILABLE`, like any other probe that did not answer, instead of being admitted with its version floor unchecked.

---
agent-host: patch
---

`HOST_FAULT` is now in the refusal registry as the host's own code, retry class `never`: `refusalOf('HOST_FAULT')` answers `{ owner: 'host', retry: 'never' }` instead of the unknown code's `{ owner: 'unknown', retry: 'never' }`. It is what a run that ended on an uncoded throw, a claim or a cancel that threw, and a failed chat leadership already answer, so clients can name it and never re-send the command on their own. `RefusalCode` gains the member.

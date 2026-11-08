---
rpc: minor
---

A bridge error now carries an optional `reason` beside `code`, read off the thrown error and set again on the error the caller receives. A masked path's refusal arrives as `EPERM` (or `EROFS`) with reason `WORKSPACE_MASKED_PATH`. The field is additive: a peer that does not know it ignores it, and an error without a reason has no `reason` property.

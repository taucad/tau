---
runtime: patch
---

Issues carried by a thrown kernel error are now validated row by row against the runtime wire's issue envelope. A row with a `message` and a `severity` is kept, with an unknown or missing `code` reported as `UNKNOWN`; a row without them, such as a `ZodError` row, is dropped, so one foreign row no longer discards the valid ones. Only when no row survives is the error reported as a single issue carrying its message; this now also holds for errors thrown by `evaluate` and `render`. Before, a `ZodError` thrown by `initialize` was forwarded as if its rows were kernel issues, and a row with an unknown code was dropped by the receiving channel. A typed refusal such as `KERNEL_REALM_CONFLICT` still names the refusing kernel in `details.producer`, now also when `initialize` rejects with a non-`Error` value. The `KERNEL_REALM_CONFLICT` message now states only the conflict; the runtime error-handling guide covers recovery.

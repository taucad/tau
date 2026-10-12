---
runtime: patch
host: patch
---

A kernel whose `initialize` throws an error with an `issues` array that is not a list of kernel issues, such as a `ZodError`, is now reported as a `KERNEL_BINDING_FAILED` issue carrying the error's message, instead of forwarding the foreign rows as kernel issues. Typed refusals such as `KERNEL_REALM_CONFLICT` still pass through with `details.producer`. Likewise, an error thrown while evaluating or rendering whose `issues` rows the runtime wire would refuse (an unknown `code`, for example) is reported as a `RUNTIME` issue with the error's message, instead of being dropped by the receiving channel. Internal typing of the Node worker transport and the Tau Host per-root runtime client is tightened, with no behaviour change.

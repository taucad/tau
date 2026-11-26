---
agent-host: patch
---

`@taucad/agent-host` leaves two User Timing entries on a turn's path for traces and the chat performance harness: a `tau.agent-host.log-write` measure around each event-log append (labelled with the row type and byte count) and a `tau.agent-host.model-request-sent` mark just before the gateway request leaves (labelled with the body size). Nothing is sent anywhere, no ids or content are recorded, and a runtime without the User Timing API records nothing.

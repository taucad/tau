---
bambu: patch
---

A Bambu start is confirmed by the printer's own status as well as by its `project_file` reply. An X1C that starts printing without a reply Tau can correlate no longer leaves the request unknown: a run carrying the start's `subtask_id`, or while live its `subtask_name`, accepts it with that run's id, and Reconcile finds it again after a reconnect. A reply whose `sequence_id` is a number is matched too.

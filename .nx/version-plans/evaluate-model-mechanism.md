---
host: minor
mcp: minor
---

`evaluate_model` reports the source's mechanism apart from its geometry, in Tau and over `tau mcp`. Its `mechanism` block says whether the source exports a mechanism (`declared`) and whether it was admitted against the delivered parts so the default view's GLB carries it (`admitted`), counts its `links`, `joints` and `couplings`, lists its `animations` by id, and lists each mechanism diagnostic once as `issues` with its code and path in the mechanism, for example a coupling that names an unknown joint; its message stays in `kernelIssues`. The block is present wherever the default view carries Tau topology or a mechanism diagnostic was reported.

`show_model` and `open_model_file` report `mechanism: { preserved, joints, animations }` for a GLB, and say it in their text ("Mechanism: 5 joints, animations four-sun-turns." or "This GLB carries no mechanism."), so an agent can tell whether the page received the mechanism: `preserved` is `true` when the GLB's Tau topology carries a mechanism and `false` otherwise, such as for a source that exports no mechanism or a plain export.

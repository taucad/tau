# Handoff prompt (paste into the cloud project)

Replace every `<…>`. Keep it under 20 lines; the resumption file carries the detail.

```text
You are the orchestrating agent for the <program name> program. Resume it from the resumption file in Tau Brain:

  tau-brain/research/artifacts/<charter-slug>/handoff/resume.md
  (from /home/user, where the project's threads start; from the Tau root it is docs/research/artifacts/<charter-slug>/handoff/resume.md once the session hook has linked Brain at repos/tau-brain)

Read it end to end first, then the charter it points to (research/<charter-slug>.md). The charter holds the decisions; the resumption file holds the state, the sequence, the hard rules, the worker brief and the operator-ping templates.

Operate with <the authority ruling, by ID: which repositories you may push and auto-merge in, whether you may publish, push Brain, close drafts>. Use work-charter for the queue; every implementation worker is <the ruled worker class, by ID>.

Work the phases in the order the resumption file gives: <phase names in order, one line>.

Ping me only with the messages in resume.md § Operator pings (<list them>), in exactly that one-message, one-command, one-reply form. Everything else is an FYI, not a question. Keep resume.md § State at handoff and § State log current and close the go-live checklist rows (<row IDs>) with evidence as they are met.
```

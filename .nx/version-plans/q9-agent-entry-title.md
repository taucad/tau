---
revisions: minor
agent-host: minor
---

Title an agent turn's History entry by the person's request (Q9). `TurnAdmitInput` and the placement channel take an optional `request`, the request's text, which agent-host derives from the admitted message for each attempt and placement carries on the result cut (`TurnCutOf.request`). The result is titled by its first line, whitespace collapsed and shortened to 72 characters, and "Agent change" without one; a turn's base cut is titled "Autosave". The `Agent turn <id>` placeholder is gone.

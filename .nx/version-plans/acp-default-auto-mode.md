---
host: minor
---

A new external-agent chat now starts in the agent's `auto` mode instead of its manual one, so a simple workspace edit no longer stops on a permission card. When the agent or its model offers no `auto`, the chat starts in the first mode of the profile's new `defaultModePreference` that it offers: Claude Code `acceptEdits` (Claude offers `auto` only on models that support it), Codex `agent` ("Approve for me"), and Grok `always-approve` while Grok has not reported Auto as enabled (operator ruling, 2026-11-17). Tau never picks Claude `bypassPermissions` or Codex `agent-full-access`. A mode the person picks for a chat is kept, through model switches and restarts. A chat Tau defaulted follows its model: it falls back when a new model loses `auto` and returns to `auto` when it comes back.

Plan modes are gone from the mode menu: Claude's `plan`, Codex's collaboration mode and Grok's Build/Plan control. A stale plan selection is never applied; Grok sessions stay in Build. The adapters' own mode names and descriptions are shown unchanged.

Breaking: `ReviewedAcpAgentProfile` requires `defaultModePreference`. `grokControlOptions` no longer takes `planning` or returns the planning select, and `grokPlanningModeOf` is removed. A Grok turn that asks for an Auto Grok has not enabled now runs in the default instead of being refused.

---
host: patch
---

Grok Build's full model list now reaches the selector. Grok never sends ACP's `config_option_update` for its models: after `session/new` it pushes `_x.ai/models/update` (its current model and every available one), and a CLI that started on an expired but renewable sign-in answers `session/new` with its built-in models only. Tau dropped that push, so the selector listed two models until a restart.

A live session now validates the push and folds it as the `config_option_update` it stands for, replacing the model option's choices and current value, so the session record and the selector refresh and a turn can select a pushed model. A push that arrives before the open's answer outranks the built-in list in it. The model probe waits up to one second after `session/new` for the push, never past its own deadline, only for an agent whose profile declares that wait (`modelListGrace`); Claude Code and Codex do not wait. `AcpSession.modelListPushed` resolves once a session has received one.

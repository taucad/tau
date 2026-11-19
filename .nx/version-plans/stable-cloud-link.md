---
revisions: minor
host: minor
cli: minor
---

Publishing points the project's one stable cloud link at the version it publishes. The link keeps its address, who can open it and its invited people across every publish; the server now answers it as `/s/tau~shr_…`.

Breaking:

- `PublishDraft` loses `title`, `sharedEmails` and `notifyRecipients`. The link shows the project's name and description (`projectName`, `description`), and invited people are managed on the link, not per publish. `visibility` is optional: absent keeps the link's setting, and a project's first publish is private.
- `PublishPublicationActorInput` is the `POST /v1/publications` body only: `projectId`, `projectName`, `tag`, `revisionId`, `entryPath`, `description?`, `visibility?`. `publishOverHttp` sends exactly that and reads the link from the answer's `share`, so it needs an API with the stable cloud link.
- `PublishPublicationActorOutput` and the `published` event gain `visibility`; `published` also gains the version's `name`. `RevisionPublishOutcome` gains `name` and `visibility`.
- `tau publish [name]`: the name is optional, and the project's name and description come from `tau.json` (with `--entry`, a project without one publishes under its directory's name). `--public` or the new `--private` set who can open the link; with neither the link keeps its setting. `--title` and `--description` are removed.

New:

- `PublishDraft.isAutoNamed`: when the revision being published already is a version, that version is published under its own name, with no second version and no rename.
- `autoVersionName(date, locales?)` from `@taucad/revisions/publish-machine` names a version nobody named, `Shared Nov 19` in the person's locale. `@taucad/host` uses it for an auto-named draft with an empty name, from the `publish` verb and from a page's `confirmPublish` request, which the Share pane sends with no name.

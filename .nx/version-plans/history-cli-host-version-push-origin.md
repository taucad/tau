---
cli: minor
host: minor
revisions: minor
---

`tau version create` and `tau version rename` back the version up before they exit, as `tau history save` does, and the tag names the account `TAU_API_URL` and `TAU_AUTH_TOKEN` belong to (else this device's pseudonym) instead of Tau. Each line ends with `Backed up.`, `Saved on this device.` or what is still owed, and `--json` carries `backup` and, when the push did not finish, `reason`.

The desktop and `tau serve` register a project linked to a GitHub repository with `origin: 'github'`, as the browser does, so a linked project first connected to Tau Cloud from them is not refused its commits Tau did not record. `registrationOrigin` is the one rule every host reads.

Breaking:

- `ProjectRevisionVerbs.tag` takes no `actor` and answers `RevisionTagOutcome` (`{ tag, backup, reason? }`) instead of the `RevisionTag` alone. `RevisionBackupOutcome` is the backup half `save` answers too.

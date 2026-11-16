---
revisions: minor
host: minor
---

No address enters a Tau identity record (I3 by construction). A person, an agent's person and a version's actor have no address field, the readers refuse a record that carries one, and the writers copy only the fields a record has. A project linked to GitHub still authors its commits under the account's GitHub no-reply identity, which now travels beside the record as the git author line alone.

Breaking:

- `RevisionUserActor` has no `email`. Its type is `email?: never`, so neither a literal nor a spread can put one in.
- `parseRevisionCommitMessage`, `parseRevisionTagMessage` and the git-notes metadata reader refuse an identity carrying `email` or any field a person or agent does not have. A commit whose trailer carries one reads as a commit Tau did not record, and a tag whose record carries one is not a version (I7: no reader for that shape).
- `revisionCommitMessage` and `revisionTagMessage` write only the fields an identity has, whatever object they are handed.
- `revisionAuthorSignature(provenance, commitAuthor?)` takes the linked forge's identity as its own input. It writes a GitHub no-reply address only, and never for an anonymous person. Otherwise the author is `<id>@users.noreply.tau.new`. `taggerSignature` always writes the Tau no-reply address.
- `WriteRevisionInput.commitAuthor` carries that identity to the store. `withCommitAuthor(port, commitAuthorFor)` hands it to every `writeRevision` of a port. `RevisionCommitAuthor` and `revisionCommitAuthorSchema` are new exports.
- A host `setActor` request whose `actor` carries `email` is refused. A linked project sends its GitHub no-reply identity as `commitAuthor` beside the actor; the request is refused when that is not a GitHub no-reply address.

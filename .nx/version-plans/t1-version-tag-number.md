---
revisions: minor
host: minor
cli: minor
---

Name version tags by number. A version's ref is `refs/tags/v<n>` and its free-text name lives in the annotated tag's message and its `Tau-Tag` trailer (now `{ version: 2, name, note?, actor? }`), so a name with spaces is a valid version name on both engines. `RevisionTag.number` is required and the name is read from the tag, never the ref; a tag under any other ref is not a version. `port.tag({ number })` renames that version at the same ref, keeping its number, entry, time and actor; `deleteTag` takes a number and only renumbering uses it. `listTags({ remote })` reads a remote's tags as last fetched. `numberVersions` and `versionNumberFor` are removed; `versionTagRef`, `versionTagName` and `versionNumberOfTag` are exported. Sync leases each version tag on its tracking ref and renumbers a version another device took. The publish draft takes an optional `version`, and the publish push, row and `published` event name the version's `v<n>` tag. The host's `deleteTag` verb is removed and its `tag` verb takes `number`. `tau version rename` takes `V<n>` or the current name and rewrites the tag in place.

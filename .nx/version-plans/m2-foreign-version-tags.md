---
revisions: patch
---

Keep a `refs/tags/v<n>` that is not a version (a lightweight tag, `v1`, a tag another tool wrote) out of the push to Tau Cloud, which refuses it and the atomic history set with it, so a `git tag v2` no longer stops every later backup. The tag stays on the device and still holds its number.

---
filesystem: minor
---

`@taucad/filesystem`'s index search takes a glob as well as a substring (D18): a query holding `*` or `?` matches as a glob, with `**` spanning directories, against the entry's name, or against its path when the pattern names a directory.

---
revisions: minor
---

Honour the checkout's own Git ignore rules on every repository and on both legs: the browser reads its nested `.gitignore` files and the store's `info/exclude` as `git check-ignore` does, and native lists them for every repository, so a cut leaves out the same untracked paths on each leg. A tracked path is never left out, and `core.excludesFile` is never read.

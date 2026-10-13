---
revisions: patch
---

Applying a revision now removes the directories its removed files left empty, as Git does, so a revision that turns a directory `foo/` into a file `foo` (a pull, merge, switch or restore of such a change) applies instead of being refused `CHECKOUT_CONFLICT`. A directory that still holds anything else, such as an ignored or unversioned file, is kept. Removing a linked checkout in the browser now deletes its files one at a time, so a deletion that fails stops the removal with nothing still deleting behind it, and the checkout stays registered for a retry.

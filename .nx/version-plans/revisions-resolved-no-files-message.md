---
revisions: patch
---

A decision that lands after a later merge already reconciled every conflicted file no longer records "Resolved 0 files on <branch>". Its revision now reads "Finished the merge into <branch>"; a decision with files left still reads "Resolved N files on <branch>".

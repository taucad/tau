---
revisions: patch
---

A checked-out branch's row in the `RevisionStatus` projection now carries `onRemote` too. `RevisionBranchFacet.onRemote` was set only on a row with no checkout, for _Remote only_; the live and linked checkouts' branches now carry the last fetch's word as well, so a page can tell that _Rename_ would be refused (`BRANCH_RENAME_PUSHED`) before it is offered. A row no fetch has reported still omits it.

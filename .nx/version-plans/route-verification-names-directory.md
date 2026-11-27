---
filesystem: minor
---

A `verified` `ProjectRouteVerification` names the directory it read: `storageRootKey` and `providerBasePath`, as a discovery locator's `storageRootKey` and `relativeDirectory` name that directory. `verifyProjectRoute` reads whichever directory the route binds when it runs, so a caller that needs a particular copy proven can check that the verification read that copy and not another the route moved to in between. Both fields are optional, since an older authority does not send them; a caller treats their absence as no proof.

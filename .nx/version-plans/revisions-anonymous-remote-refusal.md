---
revisions: patch
---

Stop telling an anonymous Git remote that it rejected saved credentials. A remote linked by address carries no credential, so when its host answers 401 (GitLab does for a private or missing repository), or a 403 with no sentence of its own, the refusal now reads "This remote asked for a sign-in Tau does not have, or has no repository at this address." A connected GitHub repository keeps "The remote rejected the saved credentials.", and a server's own sentence is still shown whenever it sends one.

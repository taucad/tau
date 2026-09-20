# Production GitOps runbook (Tau)

The operator steps for a production promotion, the GitHub environment and token split, and break-glass are operational. They live in Tau's private operations handbook at `docs/handbooks/cloud/` (`operate/deploy-and-promote.md`, `operate/terraform-change.md`, `operate/break-glass-ui-deploy.md`), maintained with the `create-handbook` skill; that path resolves only in a checkout that has the private handbook.

The public deployment contract — the branch-to-deploy topology and the cookie, CORS and COEP rules — is [ui-deployment-topology.md](./ui-deployment-topology.md).

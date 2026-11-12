---
host: patch
---

Build the shell service from the private `@taucad/shell-service` library, which this package now bundles under `dist/libs/shell-service/`, together with the stateless shell identity, baseline and provider-type modules of `@taucad/sandbox` it uses. The published surface is unchanged: the root still exports `createShellService`, `probeHostShell`, `shellApprovalKey`, `shellApprovalPrompt`, the shell contract (`shellLimits`, `shellLogDirectory`, `shellNotStartedCodes`, `isShellError`) and every shell and Terminal type, and the package still declares neither `@anthropic-ai/sandbox-runtime` nor `node-pty`.

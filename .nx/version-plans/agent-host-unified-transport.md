---
agent-host: minor
---

`createGatewayModelTransport` takes a `billing` option that chooses the billing layer per run from the API's deployment answer. The host supplies `billing.deployment`, a port answering `funded`, `unfunded` or `unknown` for the transport's API origin, and `billing.principal`. Each run asks the port once at admission and records the mode on its `run.lifecycle` row as `deployment`. A funded run gets operation binding, attempt resolution and the charged account. An unfunded run gets the plain transport. An `unknown` answer ends the run with the resumable code `DEPLOYMENT_UNKNOWN` before any model call. A resumed attempt keeps the mode its run recorded. New public types: `GatewayBillingOptions`, `ModelDeployment`, `DeploymentModeAnswer` and `RunBillingMode`. `createTauCloudGatewayModelTransport` stays as an always-funded compatibility export, and existing chat logs read and resume unchanged.

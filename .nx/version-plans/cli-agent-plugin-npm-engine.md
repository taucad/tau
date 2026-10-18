---
agent-plugin: patch
cli: patch
---

`@taucad/cli` and `@taucad/agent-plugin` declare `engines.npm` `>=11.0.0` beside `engines.node` `>=24.0.0`: npm 10, which Node.js 22 ships, cannot resolve the CLI's dependency graph, and npm now warns about it at install time. Each release is checked after it is published: the CLI installed from the registry with its install scripts blocked on npm 11 and with npm 12's default script policy, started through the plugin's launcher and asked to evaluate a model, with matching versions across the CLI, its server and the plugin's manifests, and the launcher exiting 2 on Node.js 22.

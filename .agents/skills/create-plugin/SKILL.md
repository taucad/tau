---
name: create-plugin
description: Create or update a publishable Tau runtime plugin toolkit with the workspace plugin generator. Use when adding kernel, transcoder, middleware, or bundler capabilities under packages/plugins or completing their package and host integration.
---

# Create Plugin

Create or update one `@taucad/*` runtime plugin toolkit. For a kernel-specific
implementation, use `.agents/skills/new-kernel/SKILL.md` after this routing step.

## Resolve

Inspect the request, `tools/workspace-plugin/src/generators/plugin/schema.json`,
the nearest same-role package, and every applicable host roster. Infer:

- one or more requested capabilities: `kernel`, `transcoder`, `middleware`, or
  `bundler`;
- `hostTarget`: `browser`, `node`, `daemon`, `python`, or `native`;
- whether the package already exists.

Ask only when an unresolved choice changes the public capability or supported
host. Do not select speculative roles.

## Create

The generator is the only supported scaffold:

```bash
pnpm nx g @taucad/workspace-plugin:plugin <name> \
  --capabilities=<comma-separated-roles> \
  --hostTarget=<target> \
  --description="<one-line description>"
```

If the package exists, update it in place instead of rerunning the generator.

## Complete

Generation is not completion. Implement every requested role, replace generated
failure stubs and placeholder budgets, and derive dependencies from actual
imports. Preserve the package-named plugin factory and `plugin` alias, one
role-named source file per selected capability, public JSDoc, Apache-2.0
metadata, and browser payload isolation where applicable.

Use public runtime authoring subpaths only. Never import runtime internals or app
code. Route kernel details and product surfaces through `/new-kernel`; do not
duplicate that workflow here.

Wire only the consumers and host rosters in the request. Record why an
incompatible roster is skipped. Remove superseded code after behavior parity.

## Verify

Run installation when dependencies changed, then repair every applicable gate:

```bash
pnpm install --no-frozen-lockfile
pnpm nx lint <project>
pnpm nx test <project> --watch=false
pnpm nx typecheck <project>
pnpm nx build <project>
pnpm nx pkgcheck <project>
```

Also inspect strict public imports, packed files, package size, generated
declarations, payload isolation, host wiring, README quick start, and license
provenance. Do not hand off with stubs, placeholder budgets, leaked host
dependencies, or failing checks.

---
title: 'Lint Policy'
description: 'Hybrid oxlint + ESLint architecture, performance principles, rule-specific decisions, and caching for the Tau monorepo.'
status: active
created: '2026-03-04'
updated: '2026-09-04'
related:
  - nx.json
  - .oxlintrc.json
  - eslint.config.mjs
  - .oxfmtrc.json
---

# Lint Policy

Linting architecture and performance best practices for this monorepo.

## Rationale

A hybrid oxlint-first setup delivers fast feedback in the editor while ESLint handles rules that require Nx project graph or cross-file resolution. Separating formatting (oxfmt) from linting avoids duplicate work and keeps CI fast. Avoid duplicate rules and profile expensive checks before changing their scope.

## Hybrid oxlint + ESLint architecture

This project uses a **hybrid linting** setup where **oxlint** runs first as a fast native pass, followed by **ESLint** for rules that oxlint cannot handle natively. Formatting is handled by **oxfmt** (Oxc formatter), not ESLint.

### How it works

1. `pnpm nx lint <project>` chains oxlint and ESLint through `nx.json` `targetDefaults`. `--files=<path>` passes the same file selection to both tools; oxlint receives the workspace-root `.oxlintrc.json` explicitly.
2. `.oxlintrc.json` owns native and JavaScript-plugin rules. `eslint.config.mjs` explicitly configures the remaining ESLint rules; it does not load `eslint-plugin-oxlint` or automatically disable overlapping rules.
3. In VS Code, the Oxc extension provides real-time oxlint diagnostics, formatting via oxfmt, and the ESLint extension handles residual rules. Both support fix-on-save.
4. CI (`pnpm nx affected -t lint`) chains both tools transparently via the Nx lint target.

### What each tool handles

**Oxlint** (native Rust, fast):

- ESLint core rules (curly, no-restricted-imports, etc.)
- `unicorn/*` rules (native) + `unicorn-js/*` gap rules via jsPlugins (better-regex, prevent-abbreviations, etc.)
- `@typescript-eslint/*` rules (including type-aware via tsgolint)
- `react/*` rules plus `react-js/*` gaps through jsPlugins
- `import/*` rules where natively supported (no-duplicates, no-cycle, no-self-import, etc.)
- `jsdoc/*` rules (native) + `jsdoc-js/*` gap rules via jsPlugins (require-jsdoc, require-description, etc.)
- `promise/*` and `node/*` rules
- `eslint-comments-js/*` rules via jsPlugins
- `no-barrel-files` via jsPlugins
- `@protontech/enforce-uint8array-arraybuffer` via jsPlugins
- Custom `tau-lint` rules (no-abusive-eslint-disable, require-disable-description)

**Oxfmt** (formatting):

- Code formatting (replaces Prettier)
- Tailwind CSS class sorting (built-in, replaces prettier-plugin-tailwindcss)
- Configuration in `.oxfmtrc.json`

**ESLint** (retained, slim):

- `@typescript-eslint/naming-convention`
- `@nx/enforce-module-boundaries` (requires Nx project graph)
- `import-x/no-extraneous-dependencies` (monorepo package.json resolution)
- `@typescript-eslint/member-ordering`
- `@typescript-eslint/explicit-member-accessibility`
- `eslint-plugin-max-params-no-constructor`
- `object-shorthand`, identifier restrictions, and scoped architecture rules

Import extensions and type-specifier style are configured in oxlint. Treat the checked-in rule configurations as the exact inventory; this list summarizes ownership.

### jsPlugins (oxlint JavaScript plugin API)

Oxlint's `jsPlugins` feature loads standard ESLint plugins in oxlint's JS runtime, extending coverage beyond native Rust rules. Plugins are registered in `.oxlintrc.json` under the `jsPlugins` array with aliases when needed to avoid name collisions with native plugins (e.g., `unicorn-js` for `eslint-plugin-unicorn`).

### Adding new rules

Prefer oxlint's native support when available. Check [oxlint rule reference](https://oxc.rs/docs/guide/usage/linter/rules.html). If oxlint doesn't support the rule natively, consider adding it via jsPlugins. Only add to ESLint if it cannot run in oxlint at all.

### Future: drop ESLint entirely

Reassess ESLint when oxlint supports the remaining rules with equivalent behavior. An upstream implementation alone is not enough: verify compatibility with Tau's installed versions and scoped configurations before migrating a rule.

## Performance principles

1. **Formatting is not linting.** Oxfmt handles formatting via `oxfmt --check` (CI) and format-on-save (editor). Formatting rules are disabled in ESLint.
2. **Don't duplicate TypeScript.** Disable any ESLint rule whose check is already performed by `tsc`.
3. **Profile expensive rules.** Keep editor latency and CI coverage in view; do not describe a rule as CI-only unless configuration actually gates it.
4. **No unused plugins.** Disable rule sets from frameworks not used by the project (e.g. Ava rules when using Vitest).
5. **Use the Nx target.** Keep cache inputs aligned with rule configuration. The shared lint command currently does not add ESLint's `--cache` flag.

## Specific rules

### `prettier/prettier` — REMOVED

Prettier has been fully replaced by **oxfmt** (Oxc formatter). The `eslint-plugin-prettier` integration that ran Prettier as an ESLint rule has been removed. Formatting is now handled entirely by oxfmt via the Oxc VS Code extension (format-on-save) and `oxfmt --check` in CI.

### `import/namespace` — DISABLED (redundant with TypeScript)

TypeScript already validates namespace imports. The native oxlint rule is explicitly disabled in `.oxlintrc.json`; keep the equivalent ESLint check disabled too.

Source: [typescript-eslint import plugin recommendations](https://typescript-eslint.io/troubleshooting/typed-linting/performance/#eslint-plugin-import)

### Default-export member checks — OXLINT

`import/no-named-as-default-member` and `import/no-named-as-default` are enabled as errors in `.oxlintrc.json`. Do not add duplicate ESLint equivalents.

### `import/no-cycle` — OXLINT

Enabled as an error with `ignoreExternal: true` in `.oxlintrc.json`. The rule runs through the shared lint target; it is not gated to CI. Profile the installed implementation before changing its scope.

Source: [import plugin no-cycle performance](https://github.com/import-js/eslint-plugin-import/issues/3047)

### `ava/*` rules — DISABLED

This project uses Vitest, not Ava. Do not load Ava rule sets.

### `import/extensions` — OXLINT

The `.js` extension rule lives in `.oxlintrc.json`. Reassess redundant checks only after verifying the behavior of the workspace's actual TypeScript module-resolution configuration.

## Typed linting

- Oxlint enables `options.typeAware: true`; ESLint configures `parserOptions.projectService` with a scoped default-project allowlist.
- Keep tsconfig `include` patterns narrow. Broad globs like `**/*` cause TypeScript to pre-parse build artifacts.
- If linting is memory-constrained, increase the semi-space: `NODE_OPTIONS=--max-semi-space-size=256`.

## Caching

- The Nx lint target declares inputs for the ESLint/oxlint configs, custom rules, and tool versions in `nx.json`.
- ESLint's file cache is a separate opt-in for direct profiling runs (`eslint --cache`). It is not enabled by the shared lint command.
- If enabling that file cache, ignore its `.eslintcache` artifact and include configuration changes in invalidation checks.

## Profiling

To identify slow rules, run:

```bash
TIMING=all pnpm eslint ./path/to/file.ts
```

For typescript-eslint debug logging:

```bash
DEBUG=typescript-eslint:* pnpm eslint ./path/to/file.ts
```

---
name: create-lint-rule
description: Add a custom tau-lint oxlint rule to enforce a Tau code standard repeatably. Use when creating a lint rule, blocking a code smell in CI, codifying a policy as an automated check, scaffolding a rule in @libs/oxlint, or wiring an oxlint jsPlugin rule and RuleTester test.
---

# Create Lint Rule

Add a custom `tau-lint` rule so a code standard is enforced automatically instead of by review. Tau lints with oxlint; custom rules are ESLint-compatible `RuleModule`s living under `libs/oxlint/src/rules/`, aggregated by the `tau-lint` jsPlugin and enabled in `.oxlintrc.json`.

Reach for a lint rule when a smell is **mechanical and repeatable** (detectable from the AST/filename). If a standard needs human judgement, write a policy doc (`/create-policy`) instead.

## Definition of Done

1. Rule + RuleTester test scaffolded under `libs/oxlint/src/rules/` (via the generator in step 0).
2. Rule implemented with real ESTree visitors, `meta.messages`, and `context.report`.
3. RuleTester `valid`/`invalid` cases cover the trigger and the near-misses that must NOT fire.
4. Rule wired into the plugin (`libs/oxlint/src/tau-lint.js`) and enabled in `.oxlintrc.json`.
5. Rule test passes.
6. Repo-wide blast radius handled: zero un-grandfathered violations, CI stays green.

## 0. Scaffold with the generator

```bash
pnpm nx g @taucad/workspace-plugin:lint-rule <rule-name> --description "One-line description."
```

`<rule-name>` is kebab-case with no plugin prefix (e.g. `no-impl-in-index` → `tau-lint/no-impl-in-index`). This creates:

- `libs/oxlint/src/rules/<rule-name>.js` — the rule stub (`export const <camelCaseName>Rule`).
- `libs/oxlint/src/rules/<rule-name>.test.js` — a RuleTester harness stub.

The generator only bootstraps files; steps 3–4 (wiring) are deliberately manual so it never rewrites the JSONC config or the plugin barrel.

## 1. Implement the rule

Edit `libs/oxlint/src/rules/<rule-name>.js`. A rule is `{ meta, create(context) }`:

- **`meta.type`**: `'problem'` (bug/correctness), `'suggestion'` (smell/style), or `'layout'`.
- **`meta.messages`**: named message templates; report by `messageId`. Use `{{placeholder}}` + `data`.
- **`meta.fixable: 'code'`** only if you provide a safe `fix(fixer)`.
- **`create(context)`** returns a visitor map keyed by ESTree node type or selector.

Scope, precision, and reporting:

- **Scope by file** with `context.filename` (e.g. only `index.ts` barrels) — return `{}` early for out-of-scope files, so the rule can be enabled globally.
- **Prefer the narrowest AST signal.** Match specific node shapes, not regex over source — regex misses `import type`, re-exports, and dynamic imports (this is exactly why import-boundary _tests_ are inferior to a rule; `@nx/enforce-module-boundaries` already covers dependency boundaries).
- **Match the rule to the intent, not to what's convenient.** A precise rule expresses a crisp invariant: `no-impl-in-index` encodes "an `index.*` is only a barrel", so it allows exactly imports and re-exports (`export … from`, `export *`, `export { … }`, `export type { … }`) — and flags every declaration, including type aliases and interfaces, plus every function, class, runtime constant, enum, namespace, and top-level side effect. When the invariant is a blanket ban, use one; when it genuinely tolerates a shape, allow that shape deliberately (and cover it with a `valid` test), never by accident.
- `context.report({ node, messageId, data, fix })`.

Worked example: [`no-impl-in-index.js`](../../../libs/oxlint/src/rules/no-impl-in-index.js) (filename-scoped, walks `Program.body`, unwraps `export` declarations, classifies each top-level statement as barrel-legal or a runtime binding/side effect).

## 2. Write RuleTester cases

Edit `<rule-name>.test.js`. Every rule needs `valid` cases (including the tempting near-misses that must NOT fire) and `invalid` cases with the expected `messageId`/`data`. Pass `filename` per case for filename-scoped rules.

## 3. Wire into the plugin

In `libs/oxlint/src/tau-lint.js`:

- Add `import { <camelCaseName>Rule } from './rules/<rule-name>.js';`
- Add `'<rule-name>': <camelCaseName>Rule,` to `plugin.rules`.
- Bump `plugin.meta.version` (minor).

## 4. Enable in `.oxlintrc.json`

Add to the top-level `rules` block:

```jsonc
"tau-lint/<rule-name>": "error"   // or "warn" to roll out gradually
```

Scope with a `files` override only if `context.filename` scoping isn't enough.

## 5. Test

```bash
npx vitest run libs/oxlint/src/rules/<rule-name>.test.js --config libs/oxlint/vitest.config.js
```

## 6. Handle the blast radius (ratchet)

A new `error` rule must not ship CI red. Scan the repo:

```bash
npx oxlint --config .oxlintrc.json 2>&1 | grep '<rule-name>):'
```

For pre-existing violations, either **fix them**, or **ratchet**: keep the rule at `"error"` and add a documented `files` override that turns it `"off"` for the current violators, grouped by intent (permanent exemptions vs. debt to burn down, with a comment pointing at the tracking issue/PR). New violations stay blocked; existing debt is explicit and greppable. Prefer fixing over grandfathering when the fix is small.

If the rule encodes a standard worth stating in prose too, pair it with a policy doc via `/create-policy` and cross-link them.

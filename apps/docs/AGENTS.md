# Documentation Site

This React Router and Fumadocs app publishes the product and runtime documentation at `docs.tau.new`. Content lives in `content/docs`; app code owns navigation, page actions, syntax rendering, and site styles.

## Local Rules

- Update the nearest `meta.json` whenever a page is added, removed, renamed, or reordered. Keep links route-relative and verify renamed headings and anchors.
- Keep header and page-action links derived from the active page source. Put copy/plain-text page actions in the header and reuse the existing actions rather than adding a sticky corner control.
- Register syntax grammars through the shared `libs/grammars` contribution and lazy-load them in the docs highlighter. Keep Monaco and Shiki language aliases aligned.
- Keep generated API styling scoped to the existing TypeDoc/Fumadocs selectors in `app/styles/global.css`; use the same Shiki syntax-token colors as authored code blocks.
- Document cross-origin isolation requirements in `content/docs/runtime/guides/cross-origin-isolation.mdx` when a runtime change affects `SharedArrayBuffer` or worker deployment.
- Follow [Documentation Policy](../../docs/policy/documentation-policy.md) for prose, code examples, headings, and link validation. Do not bypass the word-budget, API-coverage, or Vale gates.

## Checks

Use `pnpm nx lint docs`, `pnpm nx test docs --watch=false`, and `pnpm nx build docs` as appropriate. Run `pnpm nx run scripts:validate-prose` for prose changes.

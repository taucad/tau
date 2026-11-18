/**
 * The CSP hash of each inline script Tau writes into its documents (progressive loading architecture P2 and shell
 * invariant 5: "the CSP and its script hashes").
 *
 * Each of these scripts has a source that is the same for every visitor, request and build, so its `'sha256-…'` hash
 * source is fixed and is listed here as a literal. `inline-script-hashes.test.ts` recomputes every hash from the
 * served source, so a change to a script that does not update its hash here fails; `check-static-shells.mts` hashes
 * every inline script of each built shell, so a new Tau inline script that is not listed here fails too.
 *
 * Not listed, because their source is not fixed: the client environment script (`window.ENV`, which carries the build
 * id and the site's environment, so it differs per deploy), the icon sprite loader (`buildSvgSpriteScript`, which
 * carries the build's hashed sprite URLs), React Router's own inline scripts (the router context, its stream and the
 * route-module loader carry loader data and build asset URLs, so they differ per build and, on function documents, per
 * request) and React's streaming runtime (`$RC`, `$RB`, which differ with the document's Suspense boundaries).
 *
 * The report-only policy (`content-security-policy.server.ts`) deliberately does not carry these hashes yet: under
 * CSP Level 2 and 3 a hash or nonce source in `script-src` makes the browser ignore `'unsafe-inline'`
 * (CSP3 § 6.7.3.2 "Does a source list allow all inline behavior for type?"), so every unlisted inline script above
 * would be reported on every page load. Admitting those needs a per-request nonce on function documents or per-build
 * hashes on the static shells, which is a separate decision.
 *
 * This module imports nothing, so a native Node build check can read it.
 */
export const tauInlineScriptHashes = {
  /** `clientFactsScript` (`#lib/client-facts`), in every document's `<head>`. */
  clientFacts: "'sha256-Yl19/+h6oYwSCWRY7fIIxP9vj3vRybeWQdeam3SUmNg='",
  /** `buildFrameHintScript()` (`#lib/frame-hint`), in every document's `<head>`. */
  frameHint: "'sha256-c1yuMu36JC6Rjm5i9FWflnZafwYOl3izf/jvtkgs8WE='",
  /** The hand-off recorder served in a `HandOffSlot` of the `project-composer` surface. */
  handOffProjectComposer: "'sha256-UnytY8O/9bxanXxwZ+FqTIo4jqFCdVdbnpLdumdSNI4='",
  /** The hand-off recorder served after Home's early chat input (`earlyInputScript`). */
  earlyChatInput: "'sha256-E/o7vNr1pNazhJwlaeU3OfcLb4bccko9gTeF1Ktx0kw='",
  /** The new-project page's name-field focus script (`focusProjectNameScript`). */
  focusProjectName: "'sha256-krFFxd6XBrbV2JhsS5gQwSQO5RrhqFDZXtxHkLZLXyc='",
  /** The web boot watchdog (`buildBootWatchdogScript`, `#lib/boot-watchdog`), in every web document's `<body>`. */
  bootWatchdog: "'sha256-/6nPNfn6S6EaAWOTYX7ngJWyLyHzsKfrg+doapL9H3E='",
} as const;

/** The name of one listed inline script. */
export type TauInlineScript = keyof typeof tauInlineScriptHashes;

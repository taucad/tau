---
name: bootstrap-package
description: >-
  Reserves new npm package names with reviewed manifest-only 0.0.0 placeholders and
  prepares the operator's authenticated publish, trust and audit run so CI can publish
  them under OIDC. Use when a package that CI will publish does not yet exist on the
  registry, including new NAPI-RS platform packages.
---

# Bootstrap a package name for OIDC publishing

npm cannot configure a trusted publisher for a name that does not exist, so a package CI
has never published cannot be published by CI. Reserve the name once with a placeholder
that is deliberately not an installable release, then bind its trusted publisher.

Authority: [NAPI architecture policy §8](../../../docs/policy/napi-architecture-policy.md),
[npm policy](../../../docs/policy/npm-policy.md).

## Boundary

The agent prepares and reviews. **The operator authenticates and publishes.** Loading this
skill authorizes neither a registry mutation nor a commit. Generate and execute publish
payloads under the session scratchpad, outside every worktree. Use the
[research artifact contract](../create-research/artifacts.md) to resolve the caller's
durable Tau Brain record. Before handoff, preserve the reviewed `spec.json`, an
evidence-only copy of `bootstrap.sh`, `INTEGRITIES.txt`, and source/helper hashes there.
Keep tarballs, temporary manifests, authentication state and raw authenticated output in
scratch. Execute the scratch script; the durable copy records what was reviewed.

## Instructions

1. **Resolve each name's facts.** For a workspace package, read `name`, `license`, `author`
   and `repository` from its `package.json` so the placeholder matches what the real
   publish will later carry. Record the GitHub `owner/repo` and the **workflow filename**
   that will publish it — npm matches a trusted publisher on organization, repository and
   workflow filename, exactly and case-sensitively. In Tau that is `.github/workflows/publish.yml`;
   in a fork it is whatever that repository's publish workflow is called.

2. **Check the registry first.** `npm view <name> version` for every name. Stop on anything
   but `E404`: a name owned by someone else is a naming decision, not a bootstrap.

3. **Write the spec and generate.** A JSON array of
   `{ name, repository, workflow, license, author, description }`, then:

   ```bash
   node .agents/skills/bootstrap-package/scripts/prepare.mjs --spec <spec.json> --out <scratch-dir>
   ```

   The script writes one manifest-only package per name (identity and ownership metadata
   only — no entry point, `files`, selectors, engine range, binaries or optional
   dependencies), packs each with `--ignore-scripts`, **fails if any tarball contains
   anything but `package/package.json`**, records sha512 integrities, and emits a reviewed
   `bootstrap.sh`.

4. **Review before handing over.** Read `bootstrap.sh` and at least one manifest. Confirm the
   name list, the `owner/repo` and workflow filename per group, and that no real content
   was packed.

5. **Hand the operator one command.** They run it from a shell with npm ≥ 11.15.0
   (`nvm use 26`; the default shell's npm is older and has no `npm trust`):

   ```bash
   nvm use 26 && bash <scratch-dir>/bootstrap.sh
   ```

   It checks the npm version and login, verifies every tarball against the recorded
   integrities before mutating anything, then publishes serially
   (`--tag bootstrap --access public --provenance=false`, skipping names that already
   exist), binds each trusted publisher serially, and audits `npm trust list` plus
   `dist-tags`. Both loops space calls by 2 s so they fit npm's 5-minute 2FA-skip window,
   and each stops on the first error so the run is resumable. `--access public` is not
   optional for a scoped package's first publish.

6. **Report the remaining manual step.** "Require two-factor authentication and disallow
   tokens" under Publishing access is configured on npmjs.com only; OIDC publishers keep
   working under it.

   When operator results are available, save sanitized per-name observations in the same
   durable record: attempted, published, skipped, pending, failed or verified; observed
   trust claim, dist-tags, `dist.integrity`, publishing-access state and observation time.
   The helper prints audit results to stdout; missing output remains unverified.

## Stop and resume

| Symptom                                            | Action                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm view` returns a version owned by someone else | Stop. No publish. The name is a decision to escalate                                                                |
| 401 / EOTP after the 2FA window                    | Re-authenticate and re-run; published names are skipped                                                             |
| 429 rate limited                                   | Wait, re-run                                                                                                        |
| E403 mentioning spam detection                     | Stop. The published subset is valid. Contact npm support citing the existing sibling packages                       |
| `npm trust` reports a configuration already exists | `npm trust list` first; revoke by id **only** if it differs from the intended claim. Never revoke a correct binding |

## Expected end state

`npm view <name>@0.0.0 dist.integrity` matches the reviewed tarball, `dist-tags` carries
`bootstrap: 0.0.0`, and `npm trust list` reports the intended repository and workflow with
publish allowed and no environment.

npm also sets `latest: 0.0.0` on a first publish whatever `--tag` says. That is unavoidable
and safe while nothing resolves the name yet; the first real release moves it.

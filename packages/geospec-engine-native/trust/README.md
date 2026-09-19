# Trusted local evaluator

This W11 slice exposes a reusable signed-evaluation API and CLI for approved declarative GeoSpec plans. The caller supplies the installed product root, immutable plan, output directory, freshness challenge, signer, and pinned verification policy. The supervisor validates the complete native result before invoking the signer callback and emits a standard DSSE envelope containing a JCS in-toto Statement v1.

The module API is:

```js
import { describeTrustedInputs, evaluateTrustedPlan } from '@taucad/geospec-engine-native/trust';
```

`index.d.mts` declares the complete public options, result, signer, policy, request, subject, and claim-inventory types. `describeTrustedInputs({ productRoot, planPath })` returns the exact approved-plan, installed-engine, runner-source, subject, claim, and profile identities that an authority can pin. `evaluateTrustedPlan(options)` requires those values in `verificationPolicy` and accepts a signer with `sign(bytes)`. The callback may keep key custody outside this process. The CLI accepts one `geospec-trusted-evaluation-request-v1` JSON file whose paths are relative to that request; its private key path is read only when signing is requested.

The policy limits are fixed: `maxArtifactBytes` is `67108864` and `maxEnvelopeBytes` is `4194304`. This bounded implementation selects Darwin ARM64 only and requires the installed `@taucad/geospec-engine-native-darwin-arm64` package to be the loader's sole available native candidate.

The retained A14 demonstration remains a caller of that seam:

```bash
output=out/artifacts/geospec-engine-native/trusted-evaluator/m4-positive-a4
node packages/geospec-engine-native/trust/demo.mjs "$output" m4-positive-a4
python3.14 packages/geospec-engine-native/trust/verify.py \
  "$output/envelope.json" \
  "$output/policy.json" \
  "$output/closure" \
  /opt/homebrew/bin/openssl
node packages/geospec-engine-native/trust/self-check.mjs "$output"
```

The demo alone hardcodes the frozen A14 installation and creates an ephemeral Ed25519 key in memory. The approved plan contains no expected result statuses; the signed inventory records the engine's observed outcomes. The signed artifact closure includes the exact evaluator runner sources and installed engine artifacts.

The Python verifier authenticates the original DSSE payload bytes with OpenSSL, then enforces the explicit in-toto/GeoSpec schema, pinned policy, complete claim and subject identities, engine and runner manifests, and artifact digests. It does not implement a second JSON canonicalizer or restrict valid GeoSpec strings and numbers to the demo's data subset.

Complete-record validation sends the aggregate plan/result, ordered row claims/results, and ingest controls through one length-framed helper child. The helper applies the installed Rust canonicalizer to every original JSON byte sequence. Plan-control validation likewise uses one batch child per plan load, so canonicalizer process counts do not grow with claim or subject count.

S10 remains held. This slice makes no process-isolation, hostile-host, independent-geometry, or production key-custody claim.

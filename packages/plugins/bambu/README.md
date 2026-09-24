# @taucad/bambu

[![npm](https://img.shields.io/npm/v/@taucad/bambu)](https://www.npmjs.com/package/@taucad/bambu)
[![downloads](https://img.shields.io/npm/dm/@taucad/bambu)](https://www.npmjs.com/package/@taucad/bambu)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/bambu)](https://www.npmjs.com/package/@taucad/bambu)
[![license](https://img.shields.io/npm/l/@taucad/bambu)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Bambu Lab Developer LAN machine plugin

## Why @taucad/bambu?

- **One call composes it** — `bambu()` registers this package's capabilities with `defineRuntime`.
- **Role factories** — `bambuMachine()` support direct authoring, isolated tests, and whole-role ordering outside plugin expansion.
- **No module-scope networking** — host protocol libraries load only when discovery or connection is requested.

## Install

```bash
npm i @taucad/bambu @taucad/runtime
```

`@taucad/runtime` is a required peer — one install must hold one runtime. This toolkit's
generated configuration schemas make `zod` a second required peer.

## Quick start

```typescript
import { defineRuntime } from '@taucad/runtime/host';
import { bambu } from '@taucad/bambu';

const runtime = defineRuntime({ plugins: [bambu()] });
```

This registers the Bambu machine definition. A trusted daemon or Electron utility must own discovery, credentials,
certificate trust, sockets, and device lifetime; importing this package does not open a network connection.

## API

| Export         | Kind            | Use                                                                           |
| -------------- | --------------- | ----------------------------------------------------------------------------- |
| `bambu`        | toolkit factory | package-named authoring factory; presets select capabilities                  |
| `plugin`       | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `bambuMachine` | machine factory | direct `machines` composition, with options                                   |

One preset, `default`, selecting `machines.default`.

## Environment

| Host                               | Supported | Notes                                                          |
| ---------------------------------- | --------- | -------------------------------------------------------------- |
| Browser worker                     | No        | `taucad.hostTarget: daemon` — this package is not browser-safe |
| Node.js daemon or Electron utility | Yes       | `>=24`; Developer LAN mode only                                |

## Supervised X1C qualification

The repository-only `bambu:qualify-x1c` target supports the BR10 read-only hardware stage. It cannot upload or start,
pause, resume, cancel, or stop a print. It refuses hardware access unless `TAU_X1C_STAGE_CONSENT=read-only` is set for
that invocation.

When the protected config is absent, `discover-read-only` performs one continuous bounded passive listen and
`probe-discovered-read-only` inspects the advertised printer's MQTTS (8883) and X1C RTSPS camera (322) certificates
without credentials. After the
operator approves both exact fingerprints, `prepare-read-only` rediscovers the printer, requires both certificates to
match, and exclusively creates the mode-`0600` config without printing its endpoint or serial:

```bash
TAU_X1C_STAGE_CONSENT=read-only \
TAU_X1C_APPROVED_MQTT_PIN=sha256:<approved-fingerprint> \
TAU_X1C_APPROVED_CAMERA_PIN=sha256:<approved-fingerprint> \
pnpm nx run bambu:qualify-x1c -- --stage=prepare-read-only
```

Keep the following JSON outside the repository at an absolute path with mode `0600`. Do not add an access code to it.
The `trust` field may be omitted for the first certificate probe.

```json
{
  "address": "printer-hostname-or-private-address",
  "serial": "printer-serial",
  "logicalId": "workshop-x1c",
  "mode": "developer-lan",
  "keychain": {
    "service": "tau-x1c-qualification",
    "account": "lan-access-code"
  },
  "trust": {
    "mqtt": "sha256:<64 lowercase hex characters>",
    "camera": "sha256:<64 lowercase hex characters>"
  }
}
```

Store the access code without putting it in shell history; placing `-w` last makes macOS Keychain prompt for it:

```bash
/usr/bin/security add-generic-password -U -s tau-x1c-qualification -a lan-access-code -w
```

After explicit read-only consent, probe the two certificates, review the returned fingerprints, place the approved
values in `trust`, and run the read-only observation. The result includes exact firmware, observed setup, one bounded
still-capture result and a reconnect check, while hashing the serial and omitting the endpoint, trust pins and access
code.

```bash
TAU_X1C_QUALIFICATION_CONFIG=/absolute/path/x1c-qualification.json \
TAU_X1C_STAGE_CONSENT=read-only pnpm nx run bambu:qualify-x1c -- --stage=probe-read-only

TAU_X1C_QUALIFICATION_CONFIG=/absolute/path/x1c-qualification.json \
TAU_X1C_STAGE_CONSENT=read-only pnpm nx run bambu:qualify-x1c -- --stage=camera-read-only

TAU_X1C_QUALIFICATION_CONFIG=/absolute/path/x1c-qualification.json \
TAU_X1C_STAGE_CONSENT=read-only pnpm nx run bambu:qualify-x1c -- --stage=serve-read-only

TAU_X1C_QUALIFICATION_CONFIG=/absolute/path/x1c-qualification.json \
TAU_X1C_STAGE_CONSENT=read-only pnpm nx run bambu:qualify-x1c -- --stage=read-only
```

## Versioning and stability

Pre-1.0: a minor version may break. Pin `~0.1.0` rather than `^0.1.0`. This package releases in the
fixed version group with `@taucad/runtime`, so the peer range always matches a published runtime.
See [version-policy.md](https://github.com/taucad/tau/blob/main/docs/policy/version-policy.md).

## Security and provenance

Every release is published from GitHub Actions with npm trusted publishing and
[provenance](https://docs.npmjs.com/generating-provenance-statements). Verify a downloaded tree:

```bash
npm audit signatures
```

## License

Apache-2.0 — see [LICENSE](./LICENSE). Bundled third-party payloads keep their own licenses.

## Links

- [Documentation](https://tau.new/docs/runtime)
- [Source](https://github.com/taucad/tau/tree/main/packages/plugins/bambu)
- [Changelog](https://github.com/taucad/tau/blob/main/packages/plugins/bambu/CHANGELOG.md)
- [Issues](https://github.com/taucad/tau/issues)

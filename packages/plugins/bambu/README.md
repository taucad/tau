# @taucad/bambu

[![npm](https://img.shields.io/npm/v/@taucad/bambu)](https://www.npmjs.com/package/@taucad/bambu)
[![downloads](https://img.shields.io/npm/dm/@taucad/bambu)](https://www.npmjs.com/package/@taucad/bambu)
[![size](https://img.shields.io/npm/unpacked-size/@taucad/bambu)](https://www.npmjs.com/package/@taucad/bambu)
[![license](https://img.shields.io/npm/l/@taucad/bambu)](./LICENSE)
[![provenance](https://img.shields.io/badge/provenance-npm-blue)](https://docs.npmjs.com/generating-provenance-statements)

Bambu Lab Developer LAN machine plugin

## Why @taucad/bambu?

- **One call composes it** — `bambu()` registers this package's capabilities with `defineRuntime`.
- **Role factories** — `bambuMachine()` and `bambuA1MiniMachine()` support direct authoring, isolated tests, and whole-role ordering outside plugin expansion.
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

| Export                        | Kind            | Use                                                                           |
| ----------------------------- | --------------- | ----------------------------------------------------------------------------- |
| `bambu`                       | toolkit factory | package-named authoring factory; presets select capabilities                  |
| `plugin`                      | toolkit factory | the same factory under its mechanical name, for loaders that read a fixed key |
| `bambuMachine`                | machine factory | X1C over Developer LAN                                                        |
| `bambuA1MiniMachine`          | machine factory | A1 mini over Developer LAN                                                    |
| `bambuSimulatorMachine`       | machine factory | a simulated X1C: no sockets, no hardware                                      |
| `bambuA1MiniSimulatorMachine` | machine factory | a simulated A1 mini                                                           |
| `bambuX1cManifest`            | manifest        | X1C hardware, FFF process, actions, jobs and qualification profiles           |
| `bambuA1MiniManifest`         | manifest        | A1 mini hardware, FFF process, actions, jobs and qualification profiles       |
| `bambuSettingsConfiguration`  | configuration   | sparse project preferences (plate, levelling, slots); also at `./settings`    |

The `default` preset retains the X1C registration (`machines.default`). Select the `a1Mini` preset to register `machines.a1Mini`, or compose both directly:

```typescript
import { bambuA1MiniMachine, bambuMachine } from '@taucad/bambu';

const runtime = defineRuntime({ machines: [bambuMachine(), bambuA1MiniMachine()] });
```

Each discovered printer has its own binding, certificate pins, credential and session.
Mini advertises a 180 mm build volume and captures a bounded JPEG still through pinned TLS port 6000.

### Qualification

An action is `qualified` only under a profile naming the hardware, firmware and attachments it was proven on; the rest
are `designed` and run only for a person in Testing mode. A connected printer whose firmware is outside a profile's
list reports that profile's actions `designed`.

| Profile                      | Printer and firmware | Actions                                                |
| ---------------------------- | -------------------- | ------------------------------------------------------ |
| `x1c-hardware-2026-10`       | X1C, 01.12.00.00     | pause, resume, cancel (with start, stop, camera still) |
| `x1c-testing-2026-10-05`     | X1C, 01.12.00.00     | chamber light, part/auxiliary/chamber fans, home, jog  |
| `a1-mini-testing-2026-10-05` | A1 mini, 01.03.30.01 | part fan, jog (no AMS lite attached)                   |

Calibration (pressure-advance profiles, automatic calibration and the printer's own routines) is a person's, who need
not stand at the printer: an agent may not start or change one.

### Developer Mode

From firmware 01.08.03.00 a printer silently drops `project_file`, `gcode_line` and filament commands unless Developer
Mode is on. The session reads it from the X1C's `fun` field and from the "MQTT command verification failed" HMS row,
shows a blocked `developer-mode` check, and refuses every write before sending while it is off. An A1 mini reports no
`fun`, so once it refuses a command the session keeps writes unavailable until it accepts one again or reconnects.

### Slots and command forms

Tau names a slot `{ unitId, slotId }` (`ams-a`/`a1` … `ams-d`/`d4`, `external`/`spool`). Bambu's tray numbers
(`ams * 4 + tray`, 254 for the external spool) belong to this package: `bambuSlotOf` and `bambuAddressOf` from
`@taucad/bambu/settings` map between the two, so a consumer never repeats them.

The clients disagree on how to address the external spool. The binding's **Command forms (testing)** setting picks the
testing program's variant (a), (b) or (c); (a) is Bambu Studio's everywhere and the default. Which forms each printer
applies is still being measured on hardware (testing program rows T6, T7, T10, T17).

### Simulators

The simulated printers drive the real session over an in-memory link: runs print the uploaded plate's layers,
filament changes walk Bambu Studio's steps, calibrations report results, and a stop ends in FAILED with
"Printing was cancelled" as an X1C does. A simulated printer applies only form (a) for the external spool and ignores
the others, and it can lag its reports, acknowledge and ignore, lose replies or turn Developer Mode off, so tests prove
the session decides from reports, never from replies. Simulation never qualifies hardware: its actions are qualified by
the `simulation` profile only.

### Build plate models (`@taucad/bambu/plate`)

| Export                 | Kind       | Use                                                                        |
| ---------------------- | ---------- | -------------------------------------------------------------------------- |
| `bambuX1cPlates`       | descriptor | the four X1C plates: GLB URL, bounds, surface colour and finish, bed names |
| `bambuPlateForBedType` | function   | map a sliced file's `curr_bed_type`, `plate_N.json` `bed_type` or Tau id   |
| `bambuX1cHotend`       | descriptor | the hotend tip GLB, with the nozzle tip at its origin                      |
| `bambuA1MiniPlates`    | descriptor | Mini Smooth/Textured PEI sheets, with their own tabs, cutouts and bounds   |
| `bambuA1MiniHotend`    | descriptor | Mini installed silicone sock and nozzle tip                                |

```typescript
import { bambuPlateForBedType } from '@taucad/bambu/plate';

const plate = bambuPlateForBedType('Textured PEI Plate');
```

The GLBs are glTF (Y-up, metres). Rotate +90° about X and scale by 1000 to place one in the plate frame: millimetres,
X right, Y toward the rear, Z up, origin at the printable area's front-left corner, Z = 0 on the print surface. They are
independently authored models built from public product facts in `models/x1c` and `models/a1-mini`; regenerate them with
`pnpm nx run bambu:render-plates`. Both Textured plates include independently reconstructed outline brand marks and fitted Geist labels. Mini Smooth uses the separately qualified dark-ink, blank-center reference. Detection-code footprints remain schematic, not functional codes. The Mini Textured PEI sheet is 0.55 mm thick (0.4 mm steel plus two 0.075 mm coatings), distinct from the 180 mm printable area. Smooth visualizations use two film-covered faces: X1C 0.85 mm and Mini 0.75 mm, including an estimated 0.05 mm adhesive allowance per face. The steel/film choices are visualization assumptions, not manufacturing measurements. Appearance-derived ink and hotend dimensions are estimates, documented in the research blueprint.

The source/hash gate for both families is `models/render.sha256`. The normal Nx command builds the CLI first. For isolated regeneration with an already qualified CLI, use:

```bash
TAU_RENDER_CLI=/absolute/path/to/packages/cli/dist/bin/tau.mjs \
node --import @oxc-node/core/register packages/plugins/bambu/scripts/render-plates.mts
```

This executes the same eight exports and source-hash update; it does not bypass asset freshness checks. The interactive viewer adds instance-owned, 8 mm repeating PEI grain through standard Three.js materials and independently builds the visible mechanical assemblies from vendor imagery. These remain appearance models, not factory CAD.

## Environment

| Host                               | Supported | Notes                                                          |
| ---------------------------------- | --------- | -------------------------------------------------------------- |
| Browser worker                     | No        | `taucad.hostTarget: daemon` — this package is not browser-safe |
| Browser (`./plate` only)           | Yes       | data and asset URLs; no protocol code                          |
| Node.js daemon or Electron utility | Yes       | `>=24`; Developer LAN mode only                                |

## Supervised X1C qualification

The repository-only `bambu:qualify-x1c` target runs the supervised hardware stages. Each stage needs consent for that
invocation: `TAU_X1C_STAGE_CONSENT=read-only` for the discovery, certificate, observation, camera and live-view stages,
which never upload, start or control a print; `TAU_X1C_STAGE_CONSENT=upload-and-start` for `print-cube`, which uploads
the pinned 25 mm PETG cube (`out/hardware/bambu-x1c`), starts it once from AMS slot A1 on firmware 01.12.00.00 and follows
it to completion. It refuses to start a cube the previous journal already started.

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

With the printer idle, the plate clear, Developer Mode on and PETG in AMS slot A1, the operator may then print the cube:

```bash
TAU_X1C_QUALIFICATION_CONFIG=/absolute/path/x1c-qualification.json \
TAU_X1C_STAGE_CONSENT=upload-and-start pnpm nx run bambu:qualify-x1c -- --stage=print-cube
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

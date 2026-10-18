#!/usr/bin/env node

/**
 * Purpose: Rewrite the `worker` pin of `packages/plugins/picogk/tau-plugin.json` from a layer record the macOS
 *   release job produced, or check, verify and describe that record for the release job's upload steps.
 * Why: the Tau PicoGK layer is built, signed and digested in CI; its pin reaches the manifest only through this
 *   reviewed rewrite (I13), never by hand. The rule is the .NET layer rule of `@taucad/dotnet-kernel-core/layer`.
 * Environment: Node 24+.
 * Usage: node --import @oxc-node/core/register packages/plugins/picogk/scripts/compose-tau-plugin.mts \
 *          --layer <tau-layer.json> [--archive <layer.tar.gz>] [--check | --write <path>] [--outputs]
 *   Without --check or --write the checked-in manifest is rewritten in place. The closure's CycloneDX SBOM
 *   (`tau-plugin.cdx.json`, charter D26) is derived from the manifest and written or checked beside it. --archive verifies the archive's bytes
 *   against the record. --outputs prints `key=value` lines for `$GITHUB_OUTPUT`.
 * Exit codes: 0 success; 1 the record, the archive or the --check comparison failed; 2 usage.
 */
import { resolve } from 'node:path';

import { runComposeTauPlugin } from '@taucad/dotnet-kernel-core/layer';

import { picogkLayer } from '#picogk-layer.js';

process.exitCode = await runComposeTauPlugin({
  layer: picogkLayer,
  manifestPath: resolve(import.meta.dirname, '../tau-plugin.json'),
  args: process.argv.slice(2),
});

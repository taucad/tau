#!/usr/bin/env node

/**
 * Purpose: Rewrite the `worker` pin of `packages/plugins/picogk/tau-plugin.json` from a layer record the macOS
 *   release job produced, or check, verify and describe that record for the release job's upload steps.
 * Why: the Tau PicoGK layer is built, signed and digested in CI; its pin reaches the manifest only through this
 *   reviewed rewrite (I13), never by hand.
 * Environment: Node 24+.
 * Usage: node --import @oxc-node/core/register packages/plugins/picogk/scripts/compose-tau-plugin.mts \
 *          --layer <tau-layer.json> [--archive <layer.tar.gz>] [--check | --write <path>] [--outputs]
 *   Without --check or --write the checked-in manifest is rewritten in place. --archive verifies the archive's bytes
 *   against the record. --outputs prints `key=value` lines for `$GITHUB_OUTPUT`.
 * Exit codes: 0 success; 1 the record, the archive or the --check comparison failed; 2 usage.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  composeManifest,
  layerReleaseTag,
  layerUrls,
  manifestText,
  payloadKey,
  picogkLayerRecordSchema,
} from '#picogk-layer.js';

const manifestPath = resolve(import.meta.dirname, '../tau-plugin.json');

const { values } = parseArgs({
  options: {
    layer: { type: 'string' },
    archive: { type: 'string' },
    check: { type: 'boolean', default: false },
    write: { type: 'string' },
    outputs: { type: 'boolean', default: false },
  },
});

const main = async (): Promise<number> => {
  if (values.layer === undefined || (values.check && values.write !== undefined)) {
    console.error(
      'Usage: compose-tau-plugin.mts --layer <tau-layer.json> [--archive <layer.tar.gz>] [--check | --write <path>] [--outputs]',
    );
    return 2;
  }
  const record = picogkLayerRecordSchema.parse(JSON.parse(await readFile(resolve(values.layer), 'utf8')));
  if (values.archive !== undefined) {
    const bytes = await readFile(resolve(values.archive));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== record.sha256 || bytes.byteLength !== record.byteLength) {
      console.error(
        `${values.archive} is ${String(bytes.byteLength)} bytes with sha256 ${sha256}; the record pins ${String(record.byteLength)} bytes with ${record.sha256}.`,
      );
      return 1;
    }
  }
  const current = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  const composed = composeManifest(current, record);
  if (values.check) {
    // Compared as data: the checked-in file is formatted by the repository's formatter, not by this script.
    if (JSON.stringify(composed) !== JSON.stringify(current)) {
      console.error(`${manifestPath} does not pin the layer ${record.sha256}; run this script without --check.`);
      return 1;
    }
  } else {
    await writeFile(values.write === undefined ? manifestPath : resolve(values.write), manifestText(composed));
  }
  if (values.outputs) {
    const [cdnUrl, releaseUrl] = layerUrls(record);
    console.log(
      [
        `sha256=${record.sha256}`,
        `byte-length=${String(record.byteLength)}`,
        `asset=${record.asset}`,
        `key=${payloadKey(record.sha256)}`,
        `tag=${layerReleaseTag(record.sha256)}`,
        `cdn-url=${cdnUrl}`,
        `release-url=${releaseUrl}`,
      ].join('\n'),
    );
  }
  return 0;
};

try {
  process.exitCode = await main();
} catch (error) {
  console.error('Composing the PicoGK manifest failed:', error);
  process.exitCode = 1;
}

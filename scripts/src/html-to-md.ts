import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { captureHtmlReference, convertHtmlSnapshot, validateHtmlArtifacts } from '#reference-html.js';
import { runReferenceCli } from '#reference-to-md.js';

const main = async (): Promise<void> => {
  await runReferenceCli({
    format: 'html',
    target: 'html-to-md',
    acquireArtifacts: async ({ id, paths, url }) =>
      captureHtmlReference({
        id,
        paths,
        url,
      }),
    validateArtifacts: validateHtmlArtifacts,
    convertArtifacts: async (paths) => {
      if (paths.format !== 'html') {
        throw new Error('HTML conversion requires HTML reference paths');
      }
      return convertHtmlSnapshot(paths.snapshot);
    },
  });
};

const isDirectRun = (): boolean =>
  process.argv[1] ? fileURLToPath(import.meta.url) === resolve(process.argv[1]) : false;

if (isDirectRun()) {
  try {
    await main();
  } catch (error) {
    console.error(`html-to-md failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

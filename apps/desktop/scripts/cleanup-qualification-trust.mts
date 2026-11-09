/** Idempotent workflow cleanup uses only the durable journal of this exact disposable run. */
import { lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
// oxlint-disable-next-line no-restricted-imports -- Cleanup shares the script-owned trust journal and exact fingerprint guards.
import { cleanupQualificationTls, linuxConsumerTlsOwner } from './qualification-tls.mjs';
const directory = resolve(z.string().min(1).parse(process.env['TAU_QUALIFICATION_DIRECTORY']));
// A Linux clean-host run trusted its mirror in the consumer's NSS database; its journal names that home.
const consumer = process.env['TAU_QUALIFICATION_CONSUMER'];
const exists = await lstat(directory).catch((error: unknown) => {
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
    return undefined;
  }
  throw error;
});
if (exists) {
  await cleanupQualificationTls(directory, consumer ? linuxConsumerTlsOwner(consumer) : undefined);
}

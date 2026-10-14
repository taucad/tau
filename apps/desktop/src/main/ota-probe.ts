/** Bounded native OTA acceptance. The runner observes replacement; it never installs the candidate. */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import type { DesktopChannel } from '#main/environment.js';
import { desktopReleaseIdentity } from '#shared/desktop-release.js';

const receiptSchema = z.object({
  nonce: z.uuid(),
  candidateTag: z.string(),
  targetVersion: z.string(),
  sourceVersion: z.string(),
  sourcePid: z.number().int().positive(),
  appPath: z.string(),
  channel: z.enum(['production', 'staging']),
  startedAt: z.number(),
  sentinel: z.string(),
});

type ProbeOptions = {
  arguments: readonly string[];
  profile: string;
  appPath: string;
  version: string;
  channel: DesktopChannel;
  packaged: boolean;
};

export const prepareOtaProbe = (options: ProbeOptions): { candidateTag: string; complete: () => void } | undefined => {
  const prefix = '--tau-ota-probe=';
  const argument = options.arguments.find((value) => value.startsWith(prefix));
  const pendingPath = join(options.profile, 'ota-probe.pending.json');
  const sentinelPath = join(options.profile, 'ota-probe-retained.txt');
  if (!argument && !existsSync(pendingPath)) {
    return undefined;
  }
  if (!options.packaged) {
    throw new Error('OTA probes require a packaged application');
  }
  if (argument && !existsSync(pendingPath)) {
    const candidateTag = argument.slice(prefix.length);
    const identity = desktopReleaseIdentity(candidateTag);
    if (identity.channel !== options.channel) {
      throw new Error('OTA probe candidate must belong to the installed channel');
    }
    if (existsSync(options.profile) && readdirSync(options.profile).length > 0) {
      throw new Error('OTA probes require an empty default profile in a disposable runner account');
    }
    mkdirSync(options.profile, { recursive: true });
    const sentinel = randomUUID();
    writeFileSync(sentinelPath, sentinel, { flag: 'wx', mode: 0o600 });
    writeFileSync(
      pendingPath,
      JSON.stringify({
        nonce: randomUUID(),
        candidateTag,
        targetVersion: identity.version,
        sourceVersion: options.version,
        sourcePid: process.pid,
        appPath: options.appPath,
        channel: options.channel,
        startedAt: Date.now(),
        sentinel,
      }),
      { flag: 'wx', mode: 0o600 },
    );
  }
  const receipt = receiptSchema.parse(JSON.parse(readFileSync(pendingPath, 'utf8')));
  if (
    receipt.appPath !== options.appPath ||
    receipt.channel !== options.channel ||
    Date.now() - receipt.startedAt > 30 * 60 * 1000 ||
    receipt.startedAt > Date.now()
  ) {
    throw new Error('OTA probe installation identity or expiry is invalid');
  }
  const candidate = desktopReleaseIdentity(receipt.candidateTag);
  if (argument && argument.slice(prefix.length) !== receipt.candidateTag) {
    throw new Error('OTA probe argument disagrees with the pending candidate');
  }
  if (candidate.version !== receipt.targetVersion || candidate.channel !== options.channel) {
    throw new Error('OTA probe receipt belongs to another channel');
  }
  return {
    candidateTag: receipt.candidateTag,
    complete: () => {
      if (process.pid === receipt.sourcePid) {
        return;
      }
      if (
        options.version !== receipt.targetVersion ||
        options.version === receipt.sourceVersion ||
        readFileSync(sentinelPath, 'utf8') !== receipt.sentinel
      ) {
        throw new Error('OTA probe did not relaunch the expected version with retained data');
      }
      const resultPath = join(options.profile, 'ota-probe.result.json');
      writeFileSync(
        `${resultPath}.tmp`,
        JSON.stringify({ ...receipt, version: options.version, pid: process.pid, completedAt: Date.now() }),
        { mode: 0o600 },
      );
      renameSync(`${resultPath}.tmp`, resultPath);
      renameSync(pendingPath, join(options.profile, 'ota-probe.completed.json'));
    },
  };
};

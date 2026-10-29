import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  composeNodeHostTelemetry,
  createFirstRunNotice,
  machineOperationReporter,
  telemetryNoticeFileName,
  telemetryNoticeText,
} from '#telemetry.js';
import type { NodeHostTelemetry } from '#telemetry.js';

describe('createFirstRunNotice', () => {
  let configDirectory: string;

  beforeEach(async () => {
    configDirectory = await mkdtemp(join(tmpdir(), 'tau-telemetry-notice-'));
  });

  afterEach(async () => {
    await rm(configDirectory, { recursive: true, force: true });
  });

  it('should write the notice once per installation and name the off switch', async () => {
    const write = vi.fn();
    createFirstRunNotice({ configDir: configDirectory, write })();
    createFirstRunNotice({ configDir: configDirectory, write })();

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(telemetryNoticeText);
    expect(telemetryNoticeText).toContain('tau telemetry off');
    await expect(readFile(join(configDirectory, telemetryNoticeFileName), 'utf8')).resolves.toMatch(/^\d{4}-/u);
  });

  it('should still show the notice once when its marker cannot be written', () => {
    const write = vi.fn();
    const notice = createFirstRunNotice({ configDir: join(configDirectory, '\0bad'), write });
    notice();
    notice();

    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe('machineOperationReporter', () => {
  it('should record one machine entry with the caller from the requester and no machine identity', () => {
    const record = vi.fn();
    const context = vi.fn(
      (caller: string): ReturnType<NodeHostTelemetry['context']> => ({
        route: 'mcp',
        caller,
        release: '1.0.0',
        platform: 'node',
        os: 'linux',
      }),
    );
    const report = machineOperationReporter({ record, context });

    report({ provider: 'bambu', kind: 'start', status: 'accepted', requester: 'agent', duration: 42 });

    expect(context).toHaveBeenCalledWith('agent');
    expect(record).toHaveBeenCalledTimes(1);
    const [entry] = record.mock.calls[0] as [Record<string, unknown>];
    expect(entry).toMatchObject({ name: 'runtime.operation', duration: 42 });
    expect(entry['detail']).toMatchObject({ operation: 'machine', outcome: 'succeeded' });
    expect(JSON.stringify(entry)).not.toMatch(/machineId|serial|address/u);
  });

  it('should tag a request from a person as the editor', () => {
    const record = vi.fn();
    const context = vi.fn(
      (caller: string): ReturnType<NodeHostTelemetry['context']> => ({
        route: 'cli',
        caller,
        release: '1.0.0',
        platform: 'node',
        os: 'linux',
      }),
    );
    machineOperationReporter({ record, context })({
      provider: 'bambu',
      kind: 'stop',
      status: 'refused',
      code: 'MACHINE_UNAVAILABLE',
      requester: 'person',
      duration: 1,
    });

    expect(context).toHaveBeenCalledWith('editor');
  });
});

describe('composeNodeHostTelemetry', () => {
  it('should never be a Cloud build: a signed-out, unconfigured CLI composes no reporter', async () => {
    const configDirectory = await mkdtemp(join(tmpdir(), 'tau-telemetry-compose-'));
    try {
      const fetch = vi.fn<typeof globalThis.fetch>();
      const telemetry = composeNodeHostTelemetry({
        route: 'cli',
        release: '1.0.0',
        apiOrigin: 'https://api.tau.test',
        configDir: configDirectory,
        env: {},
        readToken: async () => ({ kind: 'none' }),
        writeNotice: vi.fn(),
        platform: 'linux',
        fetch,
      });

      expect(telemetry.status()).toMatchObject({ cloudHost: false });
      expect(telemetry.ensureReporter()).toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      await rm(configDirectory, { recursive: true, force: true });
    }
  });
});

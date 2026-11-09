/* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names are snake_case. */
import type { Event } from '@sentry/electron/main';
import { describe, expect, it } from 'vitest';
import {
  applyRendererGoneSnapshot,
  rendererCrashSnapshotLifetime,
  snapshotRendererGone,
} from '#main/renderer-crash-context.js';

const crashedAt = 1_794_000_000_000;

const deadPageTags = {
  route: 'routes/w.$workspace.$project',
  last_activity: 'render',
  live_project_count: '2',
  chat_count: '1',
  device_class: 'standard',
};

/** A renderer minidump as the SDK builds it after the window reloaded onto Home. */
const minidump = (): Event => ({
  platform: 'native',
  level: 'fatal',
  tags: {
    'event.process': 'renderer',
    'exit.reason': 'crashed',
    route: 'routes/_index',
    last_activity: 'open',
    environment_kind: 'kept',
  },
  breadcrumbs: [
    { timestamp: crashedAt / 1000 - 5, message: 'before' },
    { timestamp: crashedAt / 1000, message: 'at' },
    { timestamp: crashedAt / 1000 + 1, message: 'after reload' },
  ],
});

describe('snapshotRendererGone', () => {
  it('should keep only the crash tags that have a value', () => {
    expect(
      snapshotRendererGone({ ...deadPageTags, chat_count: '', 'event.origin': 'electron', other: 3 }, crashedAt),
    ).toStrictEqual({
      at: crashedAt,
      tags: {
        route: 'routes/w.$workspace.$project',
        last_activity: 'render',
        live_project_count: '2',
        device_class: 'standard',
      },
    });
  });
});

describe('applyRendererGoneSnapshot', () => {
  const snapshot = snapshotRendererGone(deadPageTags, crashedAt);

  it("should put the dead page's tags back and drop breadcrumbs from after the crash", () => {
    const { event, spent } = applyRendererGoneSnapshot(minidump(), snapshot, crashedAt + 3000);
    expect(spent).toBe(true);
    expect(event.tags).toStrictEqual({
      'event.process': 'renderer',
      'exit.reason': 'crashed',
      environment_kind: 'kept',
      ...deadPageTags,
    });
    expect(event.breadcrumbs?.map((breadcrumb) => breadcrumb.message)).toStrictEqual(['before', 'at']);
  });

  it("should drop a reloaded page's crash tag the dead page did not have", () => {
    const { event } = applyRendererGoneSnapshot(
      minidump(),
      snapshotRendererGone({ device_class: 'standard' }, crashedAt),
      crashedAt + 1000,
    );
    expect(event.tags).toStrictEqual({
      'event.process': 'renderer',
      'exit.reason': 'crashed',
      environment_kind: 'kept',
      device_class: 'standard',
    });
  });

  it('should leave other events, stale snapshots and a missing snapshot alone', () => {
    const mainError = { platform: 'node', tags: { route: 'routes/_index' } };
    expect(applyRendererGoneSnapshot(mainError, snapshot, crashedAt + 1000)).toStrictEqual({
      event: mainError,
      spent: false,
    });
    const gpuDump = { platform: 'native', tags: { 'event.process': 'GPU' } };
    expect(applyRendererGoneSnapshot(gpuDump, snapshot, crashedAt + 1000).spent).toBe(false);
    const late = minidump();
    expect(applyRendererGoneSnapshot(late, snapshot, crashedAt + rendererCrashSnapshotLifetime + 1)).toStrictEqual({
      event: late,
      spent: false,
    });
    const early = minidump();
    expect(applyRendererGoneSnapshot(early, snapshot, crashedAt - 1).spent).toBe(false);
    const none = minidump();
    expect(applyRendererGoneSnapshot(none, undefined, crashedAt).event).toBe(none);
  });
});

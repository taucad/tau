import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { desktopChatObserver } from '#tau/services-host-evidence.js';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tau-evidence-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const noRows = vi.fn(async ({ cursor }: { cursor: number }) => ({
  cursor,
  nextCursor: cursor,
  endCursor: 0,
  events: [],
}));

describe('desktopChatObserver', () => {
  it('should ask for the grant with the session’s bearer', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}', { status: 401 }));
    const observer = desktopChatObserver({
      directory,
      apiBaseUrl: 'https://api.test/',
      projectId: 'project-1',
      principal: () => 'user-1',
      token: () => 'session-token',
      fetch: fetchMock,
    })(noRows);

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    /* A refused grant purges the queue file; settle that write before the directory is removed. */
    await observer.reporter.refresh();
    observer.close();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.test/v1/telemetry-purposes?projectId=project-1');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer session-token');
  });

  it('should send nothing while signed out', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const observer = desktopChatObserver({
      directory,
      apiBaseUrl: 'https://api.test',
      projectId: 'project-1',
      principal: () => undefined,
      token: () => undefined,
      fetch: fetchMock,
    })(noRows);

    observer.onChatQuiescent('chat-1', true);
    await vi.waitFor(() => {
      expect(noRows).toHaveBeenCalled();
    });
    await observer.reporter.refresh();
    observer.close();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { metaConfig } from '#constants/meta.constants.js';

const channelName = `${metaConfig.databasePrefix}build-id`;

/** Fresh module graph per test: the build id is captured at module load. */
const load = async () => {
  vi.resetModules();
  const skew = await import('#filesystem/build-skew.js');
  const { BuildSkewBanner } = await import('#components/build-skew-banner.js');
  return { ...skew, BuildSkewBanner };
};

const announce = (buildId: number): void => {
  const channel = new BroadcastChannel(channelName);
  channel.postMessage(buildId);
  channel.close();
};

const openChannels: BroadcastChannel[] = [];

/** The server names `liveBuildId` as the build it renders pages for (`/health/build`). */
const serveLiveBuild = (liveBuildId: number): void => {
  vi.stubGlobal('fetch', async () => Response.json({ buildId: liveBuildId }));
};

const listen = (): MessageEvent[] => {
  const channel = new BroadcastChannel(channelName);
  openChannels.push(channel);
  const heard: MessageEvent[] = [];
  channel.addEventListener('message', (event: MessageEvent) => {
    heard.push(event);
  });
  return heard;
};

const pause = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
  });
};

afterEach(() => {
  for (const channel of openChannels.splice(0)) {
    channel.close();
  }
  vi.unstubAllGlobals();
});

describe('build-id skew guard (DF20)', () => {
  it('suspends durable writes and prompts a reload when a newer build announces itself', async () => {
    const { BuildSkewBanner, buildId, isBuildSuperseded } = await load();
    render(<BuildSkewBanner />);
    expect(isBuildSuperseded()).toBe(false);

    announce(buildId + 1);

    expect(await screen.findByRole('alert')).toHaveTextContent('A newer version of Tau is available');
    expect(isBuildSuperseded()).toBe(true);
  });

  it('prompts a reload when the server reports that a deploy superseded this build', async () => {
    const { BuildSkewBanner, buildId, isBuildSuperseded, markBuildSuperseded, readSupersedingBuildId } = await load();
    render(<BuildSkewBanner />);

    act(() => {
      markBuildSuperseded(buildId + 1);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('A newer version of Tau is available');
    expect(isBuildSuperseded()).toBe(true);
    expect(readSupersedingBuildId()).toBe(buildId + 1);
  });

  it('names the build a rollback serves, not this one, as the build to reload into', async () => {
    const { BuildSkewBanner, buildId, isBuildSuperseded, markBuildSuperseded, readSupersedingBuildId } = await load();
    render(<BuildSkewBanner />);

    act(() => {
      markBuildSuperseded(buildId - 1);
    });

    expect(isBuildSuperseded()).toBe(true);
    expect(readSupersedingBuildId()).toBe(buildId - 1);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This version of Tau has been replaced. Reload to continue with the current version.',
    );
  });

  it('lets a newer tab outrank an earlier rollback', async () => {
    const { buildId, markBuildSuperseded, readSupersedingBuildId } = await load();

    markBuildSuperseded(buildId - 1);
    markBuildSuperseded(buildId + 1);

    expect(readSupersedingBuildId()).toBe(buildId + 1);
  });

  it('keeps a tab on the live build when a tab on a replaced build announces a newer one', async () => {
    const { buildId, isBuildSuperseded } = await load();
    serveLiveBuild(buildId);
    const heard = listen();

    announce(buildId + 1);
    await pause();

    expect(isBuildSuperseded()).toBe(false);
    expect(heard.map((event) => event.data as unknown)).toContainEqual({ buildId, live: true });
  });

  it('supersedes this tab with the live build when another tab confirms it is live', async () => {
    const { buildId, isBuildSuperseded, readSupersedingBuildId } = await load();
    const channel = new BroadcastChannel(channelName);
    openChannels.push(channel);

    channel.postMessage({ buildId: buildId - 1, live: true });
    await pause();

    expect(isBuildSuperseded()).toBe(true);
    expect(readSupersedingBuildId()).toBe(buildId - 1);
  });

  it('names the build the server serves, not the announcing tab, when the server knows better', async () => {
    const { buildId, isBuildSuperseded, readSupersedingBuildId } = await load();
    serveLiveBuild(buildId - 1);

    announce(buildId + 1);
    await pause();

    expect(isBuildSuperseded()).toBe(true);
    expect(readSupersedingBuildId()).toBe(buildId - 1);
  });

  it('records the live build for the prompt without superseding this tab yet', async () => {
    const { buildId, isBuildSuperseded, readSupersedingBuildId, recordLiveBuild } = await load();

    recordLiveBuild(buildId - 1);

    expect(readSupersedingBuildId()).toBe(buildId - 1);
    expect(isBuildSuperseded()).toBe(false);
  });

  it('leaves an equal or older build untouched', async () => {
    const { BuildSkewBanner, buildId, isBuildSuperseded } = await load();
    render(<BuildSkewBanner />);

    announce(buildId);
    announce(buildId - 1);
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(isBuildSuperseded()).toBe(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('answers an older tab so it learns that it is stale', async () => {
    const { buildId } = await load();
    const channel = new BroadcastChannel(channelName);
    openChannels.push(channel);
    const heard = new Promise<number>((resolve) => {
      channel.addEventListener('message', (event: MessageEvent) => {
        resolve(event.data as number);
      });
    });

    channel.postMessage(buildId - 1);

    await expect(heard).resolves.toBe(buildId);
  });
});

// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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

afterEach(() => {
  for (const channel of openChannels.splice(0)) {
    channel.close();
  }
});

describe('build-id skew guard (DF20)', () => {
  it('suspends durable writes and prompts a reload when a newer build announces itself', async () => {
    const { BuildSkewBanner, buildId, isBuildSuperseded } = await load();
    render(<BuildSkewBanner />);
    expect(isBuildSuperseded()).toBe(false);

    announce(buildId + 1);

    expect(await screen.findByRole('alert')).toHaveTextContent('A newer version of Tau is running');
    expect(isBuildSuperseded()).toBe(true);
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

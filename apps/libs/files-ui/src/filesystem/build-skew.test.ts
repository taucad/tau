import { afterEach, describe, expect, it, vi } from 'vitest';
import { appMetaConfig } from '@taucad/ui-core/constants/meta.constants';
import { createBuildSkew, lookupConfirmDelay, serverConfirmations } from '#filesystem/build-skew.js';
import type { BuildIdentity, BuildSkew } from '#filesystem/build-skew.js';

const channelName = `${appMetaConfig.databasePrefix}build-id`;

const started: BuildSkew[] = [];
const openChannels: BroadcastChannel[] = [];

/** Start a guard with an injected identity; the server answers `askLiveBuild`. */
const start = (identity: Partial<BuildIdentity> & Pick<BuildIdentity, 'buildId'>): BuildSkew => {
  const skew = createBuildSkew({ askLiveBuild: async () => 'none', liveBuildIdTimeout: 4000, ...identity });
  started.push(skew);
  return skew;
};

const listen = (): unknown[] => {
  const channel = new BroadcastChannel(channelName);
  openChannels.push(channel);
  const heard: unknown[] = [];
  channel.addEventListener('message', (event: MessageEvent) => {
    heard.push(event.data);
  });
  return heard;
};

const announce = (message: unknown): void => {
  const channel = new BroadcastChannel(channelName);
  channel.postMessage(message);
  channel.close();
};

afterEach(() => {
  for (const channel of openChannels.splice(0)) {
    channel.close();
  }
  for (const skew of started.splice(0)) {
    skew.closeBuildSkewChannel();
  }
});

describe('createBuildSkew', () => {
  it('should announce the injected build id to the other tabs', async () => {
    const heard = listen();
    const skew = start({ buildId: 200 });
    expect(skew.buildId).toBe(200);
    await vi.waitFor(() => {
      expect(heard).toContain(200);
    });
  });

  it('should derive the lookup budget from the injected request timeout', () => {
    const skew = start({ buildId: 200, liveBuildIdTimeout: 1000 });
    expect(skew.lookupBudget).toBe((1 + serverConfirmations) * 1000 + serverConfirmations * lookupConfirmDelay);
  });

  it('should stop writes on a newer peer and ask the injected live-build question', async () => {
    const askLiveBuild = vi.fn<BuildIdentity['askLiveBuild']>(async () => 'none');
    const skew = start({ buildId: 200, askLiveBuild });
    announce(300);
    await vi.waitFor(() => {
      expect(askLiveBuild).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(skew.readSupersedingBuildId()).toBe(300);
    });
    expect(skew.isBuildSuperseded()).toBe(true);
    expect(skew.describeSupersession(skew.readSupersedingBuildId())).toMatch(/newer version/u);
  });

  it('should ask nothing in a bundle without a build id', async () => {
    const askLiveBuild = vi.fn<BuildIdentity['askLiveBuild']>(async () => 'none');
    const skew = start({ buildId: 0, askLiveBuild });
    await skew.queryLiveBuild();
    expect(askLiveBuild).not.toHaveBeenCalled();
    expect(skew.readServerVerdict()).toBe('unknown');
  });

  it('should confirm this build live once the server names it', async () => {
    const askLiveBuild = vi.fn<BuildIdentity['askLiveBuild']>(async () => 200);
    const skew = start({ buildId: 200, askLiveBuild });
    const onVerdict = vi.fn();
    skew.subscribeServerVerdict(onVerdict);
    await skew.queryLiveBuild();
    expect(skew.readServerVerdict()).toBe('live');
    expect(onVerdict).toHaveBeenCalledOnce();
  });
});

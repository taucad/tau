// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { metaConfig } from '#constants/meta.constants.js';

const channelName = `${metaConfig.databasePrefix}build-id`;

const loaded: Array<{ readonly closeBuildSkewChannel: () => void }> = [];

/** Fresh module graph per test: the build id is captured at module load. */
const load = async () => {
  vi.resetModules();
  const skew = await import('#filesystem/build-skew.js');
  loaded.push(skew);
  const { BuildSkewBanner } = await import('#components/build-skew-banner.js');
  return { ...skew, BuildSkewBanner };
};

const announce = (message: unknown): void => {
  const channel = new BroadcastChannel(channelName);
  channel.postMessage(message);
  channel.close();
};

const openChannels: BroadcastChannel[] = [];

type LiveAnswer = number | 'unreachable' | 'spa-fallback';

const respond = (answer: LiveAnswer): Response => {
  if (answer === 'unreachable') {
    throw new TypeError('Failed to fetch');
  }
  return answer === 'spa-fallback'
    ? new Response('<!DOCTYPE html>', { headers: { 'content-type': 'text/html' } })
    : Response.json({ buildId: answer });
};

/** The server's answer to `/health/build`, settled by the test; counts the requests. */
const serveLiveBuild = (): {
  readonly requests: () => number;
  readonly settle: (answer: LiveAnswer) => Promise<void>;
} => {
  let requests = 0;
  const waiting: Array<(answer: LiveAnswer) => void> = [];
  vi.stubGlobal('fetch', async () => {
    requests += 1;
    const answer = await new Promise<LiveAnswer>((resolve) => {
      waiting.push(resolve);
    });
    return respond(answer);
  });
  return {
    requests: () => requests,
    async settle(answer) {
      await act(async () => {
        for (const resolve of waiting.splice(0)) {
          resolve(answer);
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 10);
        });
      });
    },
  };
};

/** The server names `answer`, and the tab asks it, as the recovery's lookups do (`queryLiveBuild`). */
const serverSays = async (queryLiveBuild: () => Promise<void>, answer: LiveAnswer): Promise<void> => {
  answerLiveBuild(answer);
  await act(async () => {
    await queryLiveBuild();
  });
};

/** The server answers every `/health/build` at once with `answer`. */
const answerLiveBuild = (answer: LiveAnswer): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(async () => respond(answer));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
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
  // An earlier test's module would otherwise keep answering this test's announcements.
  for (const skew of loaded.splice(0)) {
    skew.closeBuildSkewChannel();
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('build-id skew guard (DF20)', () => {
  it('stops durable writes at once when a newer build announces itself, before the server answers', async () => {
    const { BuildSkewBanner, buildId, isBuildSuperseded, isReloadOffered } = await load();
    const server = serveLiveBuild();
    render(<BuildSkewBanner />);

    announce(buildId + 1);
    await pause();

    expect(isBuildSuperseded()).toBe(true);
    expect(isReloadOffered()).toBe(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await server.settle(buildId + 1);

    expect(isBuildSuperseded()).toBe(true);
    expect(await screen.findByRole('alert')).toHaveTextContent('A newer version of Tau is available');
  });

  it('lifts the provisional write stop once the server has confirmed this build, and says so', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { BuildSkewBanner, buildId, isBuildSuperseded, peerRecheckDelay, serverConfirmations } = await load();
    answerLiveBuild(buildId);
    const heard = listen();
    render(<BuildSkewBanner />);

    announce(buildId + 1);
    await pause();
    // One answer naming this build does not lift a peer's stop: an edge may answer for a build it leaves.
    expect(isBuildSuperseded()).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay * serverConfirmations);
    });
    await pause();

    expect(isBuildSuperseded()).toBe(false);
    expect(heard.map((event) => event.data as unknown)).toContainEqual({ buildId, live: true });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('falls back to the newer announcement when the server cannot be reached', async () => {
    const { buildId, isBuildSuperseded, readSupersedingBuildId } = await load();
    answerLiveBuild('unreachable');

    announce(buildId + 1);
    await pause();

    expect(isBuildSuperseded()).toBe(true);
    expect(readSupersedingBuildId()).toBe(buildId + 1);
  });

  it("resumes writing once the server names this build, when it was superseded only on a peer's word", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const {
      BuildSkewBanner,
      buildId,
      isBuildSuperseded,
      readSupersedingBuildId,
      peerRecheckDelay,
      serverConfirmations,
    } = await load();
    answerLiveBuild('unreachable');
    const heard = listen();
    render(<BuildSkewBanner />);
    announce(buildId + 1);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(isBuildSuperseded()).toBe(true);

    answerLiveBuild(buildId);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay * (1 + serverConfirmations));
    });
    await pause();

    expect(isBuildSuperseded()).toBe(false);
    expect(readSupersedingBuildId()).toBe(buildId);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(heard.map((event) => event.data as unknown)).toContainEqual({ buildId, live: true });
  });

  it('resumes only once as many later checks name this build as it takes to leave supersession', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { buildId, isBuildSuperseded, peerRecheckDelay, serverConfirmations } = await load();
    answerLiveBuild(buildId - 1);
    announce(buildId + 1);
    await pause();
    expect(isBuildSuperseded()).toBe(true);

    answerLiveBuild(buildId);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay * serverConfirmations);
    });
    await pause();
    expect(isBuildSuperseded()).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay);
    });
    await pause();

    expect(isBuildSuperseded()).toBe(false);
  });

  it('stays superseded when one stale answer names this build during a rollout, and claims nothing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { buildId, isBuildSuperseded, readServerVerdict, peerRecheckDelay, serverConfirmations } = await load();
    answerLiveBuild(buildId + 1);
    announce(buildId + 1);
    await pause();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay * serverConfirmations);
    });
    await pause();
    const heard = listen();

    // An edge still answering for the build it is leaving names this one, once.
    answerLiveBuild(buildId);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay);
    });
    answerLiveBuild(buildId + 1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay * 3);
    });
    await pause();

    expect(isBuildSuperseded()).toBe(true);
    expect(readServerVerdict()).toBe('replaced');
    // The newer tab hears no live claim, so its writes are not stopped.
    expect(heard.map((event) => event.data as unknown)).not.toContainEqual({ buildId, live: true });
  });

  it('stops asking once the server has named another build on every confirmation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { buildId, isBuildSuperseded, peerRecheckDelay, serverConfirmations } = await load();
    const fetchMock = answerLiveBuild(buildId - 1);
    announce(buildId + 1);
    await pause();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay * (serverConfirmations + 3));
    });
    await pause();

    expect(isBuildSuperseded()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1 + serverConfirmations);
  });

  it("confirms the server's first naming of another build even when it comes from a recheck after no answer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { buildId, isBuildSuperseded, readSupersedingBuildId, peerRecheckDelay, serverConfirmations } = await load();
    answerLiveBuild('unreachable');
    announce(buildId + 1);
    await pause();

    const fetchMock = answerLiveBuild(buildId - 1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay * (serverConfirmations + 3));
    });
    await pause();

    expect(isBuildSuperseded()).toBe(true);
    expect(readSupersedingBuildId()).toBe(buildId - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1 + serverConfirmations);
  });

  it('resumes once confirmations that follow a recheck after no answer name this build', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { buildId, isBuildSuperseded, peerRecheckDelay, serverConfirmations } = await load();
    answerLiveBuild('unreachable');
    announce(buildId + 1);
    await pause();
    answerLiveBuild(buildId - 1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay);
    });
    await pause();

    answerLiveBuild(buildId);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay * (serverConfirmations + 1));
    });
    await pause();

    expect(isBuildSuperseded()).toBe(false);
  });

  it('asks again, and resumes, when a tab on its own build appears after the server superseded it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { buildId, isBuildSuperseded, peerRecheckDelay, serverConfirmations } = await load();
    answerLiveBuild(buildId - 1);
    announce(buildId + 1);
    await pause();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay * (serverConfirmations + 1));
    });
    await pause();
    expect(isBuildSuperseded()).toBe(true);

    // The rollback is undone: a fresh tab loads this build again and announces it.
    answerLiveBuild(buildId);
    announce(buildId);
    await pause();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay * serverConfirmations);
    });
    await pause();

    expect(isBuildSuperseded()).toBe(false);
  });

  it('tells the peer whose claim stopped it once writes resume', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { buildId, isBuildSuperseded, offerReload, queryLiveBuild, peerRecheckDelay, serverConfirmations } =
      await load();
    await serverSays(queryLiveBuild, buildId + 1);
    act(() => {
      offerReload(buildId + 1);
    });
    const heard = listen();
    answerLiveBuild(buildId);

    announce(buildId + 2);
    await pause();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay * serverConfirmations);
    });
    await pause();

    expect(isBuildSuperseded()).toBe(false);
    expect(heard.map((event) => event.data as unknown)).toContainEqual({ buildId, live: true });
  });

  it('keeps counting back to this build when a recheck gets no answer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { buildId, isReloadOffered, offerReload, queryLiveBuild, peerRecheckDelay, serverConfirmations } =
      await load();
    await serverSays(queryLiveBuild, buildId + 1);
    act(() => {
      offerReload(buildId + 1);
    });
    await serverSays(queryLiveBuild, buildId);

    answerLiveBuild('unreachable');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay);
    });
    answerLiveBuild(buildId);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay * (serverConfirmations + 1));
    });
    await pause();

    expect(isReloadOffered()).toBe(false);
  });

  it('shares one question and its confirmations among every caller of queryLiveBuild', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { buildId, queryLiveBuild, lookupConfirmDelay, serverConfirmations } = await load();
    const fetchMock = answerLiveBuild(buildId + 1);

    const first = queryLiveBuild();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(lookupConfirmDelay / 2);
    });
    const second = queryLiveBuild();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(lookupConfirmDelay * (serverConfirmations + 1));
    });
    await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1 + serverConfirmations);
  });

  it("resumes writing once a later announcement's check, confirmed, names this build", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { buildId, isBuildSuperseded, peerRecheckDelay, serverConfirmations } = await load();
    answerLiveBuild('unreachable');
    announce(buildId + 1);
    await pause();
    expect(isBuildSuperseded()).toBe(true);

    answerLiveBuild(buildId);
    announce(buildId + 2);
    await pause();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay * serverConfirmations);
    });
    await pause();

    expect(isBuildSuperseded()).toBe(false);
  });

  it('keeps the old newer-wins rule, and asks no more, on a host without a build endpoint', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { buildId, isBuildSuperseded, readSupersedingBuildId, peerRecheckDelay } = await load();
    const fetchMock = answerLiveBuild('spa-fallback');

    announce(buildId + 1);
    await pause();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay * 3);
    });

    expect(isBuildSuperseded()).toBe(true);
    expect(readSupersedingBuildId()).toBe(buildId + 1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('stays silent to older tabs once the server has superseded it, so a rollback cannot echo', async () => {
    const { buildId, isBuildSuperseded } = await load();
    answerLiveBuild(buildId - 2);
    announce(buildId + 1);
    await pause();
    expect(isBuildSuperseded()).toBe(true);
    const heard = listen();

    announce(buildId - 2);
    await pause();

    expect(heard.map((event) => event.data as unknown)).not.toContain(buildId);
  });

  it.each(['a deploy offered the reload', 'the server named another build'])(
    'still tells older tabs to stop while it keeps writing (%s), since two writing bundles is what DF20 prevents',
    async (situation) => {
      const { buildId, offerReload, queryLiveBuild } = await load();
      if (situation === 'a deploy offered the reload') {
        act(() => {
          offerReload(buildId + 1);
        });
      } else {
        await serverSays(queryLiveBuild, buildId + 1);
      }
      const heard = listen();

      announce(buildId - 2);
      await pause();

      expect(heard.map((event) => event.data as unknown)).toContain(buildId);
    },
  );

  it("withdraws a deploy's reload offer once the server confirms this build again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { buildId, isReloadOffered, offerReload, readSupersedingBuildId, peerRecheckDelay, serverConfirmations } =
      await load();
    act(() => {
      offerReload(buildId + 1);
    });
    expect(isReloadOffered()).toBe(true);
    answerLiveBuild(buildId);

    announce({ buildId: buildId + 1, live: true });
    await pause();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay * serverConfirmations);
    });
    await pause();

    expect(isReloadOffered()).toBe(false);
    expect(readSupersedingBuildId()).toBe(buildId);
  });

  it('names the build the server serves, not the announcing tab, when the server knows better', async () => {
    const { buildId, isBuildSuperseded, readSupersedingBuildId } = await load();
    answerLiveBuild(buildId - 1);

    announce(buildId + 1);
    await pause();

    expect(isBuildSuperseded()).toBe(true);
    expect(readSupersedingBuildId()).toBe(buildId - 1);
  });

  it("checks a peer's live claim with the server and resumes once confirmed, without answering it with a claim of its own", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { buildId, isBuildSuperseded, peerRecheckDelay, serverConfirmations } = await load();
    answerLiveBuild(buildId);
    const heard = listen();

    announce({ buildId: buildId - 1, live: true });
    await pause();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay * serverConfirmations);
    });
    await pause();

    expect(isBuildSuperseded()).toBe(false);
    expect(heard.map((event) => event.data as unknown)).not.toContainEqual({ buildId, live: true });
  });

  it("settles in a bounded number of server checks when two tabs' edges name different builds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { buildId, isBuildSuperseded, peerRecheckDelay, serverConfirmations } = await load();
    // This tab's edge names its own build.
    const fetchMock = answerLiveBuild(buildId);
    /* The other tab, on build `buildId - 1`, behind an edge that names that build: it answers each live
     * claim for another build by checking its own edge and claiming its own build live in turn. */
    const peer = new BroadcastChannel(channelName);
    openChannels.push(peer);
    let peerChecks = 0;
    peer.addEventListener('message', (event: MessageEvent) => {
      const message = event.data as { readonly buildId?: number; readonly live?: boolean };
      if (message.live === true && message.buildId !== buildId - 1) {
        peerChecks += 1;
        peer.postMessage({ buildId: buildId - 1, live: true });
      }
    });

    // The other tab boots and announces its (older) build plainly; this tab answers with its own.
    announce(buildId - 1);
    peer.postMessage({ buildId: buildId - 1, live: true });
    await pause();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(peerRecheckDelay * (serverConfirmations + 5));
    });
    await pause();

    expect(isBuildSuperseded()).toBe(false);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(1 + serverConfirmations);
    expect(peerChecks).toBeLessThanOrEqual(1);
  });

  it.each<LiveAnswer>(['unreachable', 'spa-fallback'])(
    "never lets an older peer's live claim stop this tab without the server's word (%s)",
    async (answer) => {
      const { buildId, isBuildSuperseded, isReloadOffered } = await load();
      answerLiveBuild(answer);

      announce({ buildId: buildId - 1, live: true });
      await pause();

      expect(isBuildSuperseded()).toBe(false);
      expect(isReloadOffered()).toBe(false);
    },
  );

  it("supersedes this tab on a peer's live claim the server confirms, worded as a replacement", async () => {
    const { BuildSkewBanner, buildId, isBuildSuperseded, readSupersedingBuildId } = await load();
    answerLiveBuild(buildId - 1);
    render(<BuildSkewBanner />);

    announce({ buildId: buildId - 1, live: true });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This version of Tau has been replaced. Reload to continue with the current version.',
    );
    expect(isBuildSuperseded()).toBe(true);
    expect(readSupersedingBuildId()).toBe(buildId - 1);
  });

  it('shares one server check among announcements that arrive together, and asks no more once decided', async () => {
    const { buildId } = await load();
    const server = serveLiveBuild();

    announce(buildId + 1);
    announce(buildId + 2);
    await pause();
    await server.settle(buildId - 1);
    announce(buildId + 3);
    await pause();

    expect(server.requests()).toBe(1);
  });

  it("keeps the server's word over a later tab announcement it could not check", async () => {
    const { buildId, isBuildSuperseded, readSupersedingBuildId, queryLiveBuild } = await load();
    await serverSays(queryLiveBuild, buildId - 1);
    answerLiveBuild('unreachable');

    announce(buildId + 5);
    await pause();

    expect(isBuildSuperseded()).toBe(true);
    expect(readSupersedingBuildId()).toBe(buildId - 1);
  });

  it('offers the reload for a deploy without stopping writes, since no other bundle owns storage', async () => {
    const { BuildSkewBanner, buildId, isBuildSuperseded, isReloadOffered, offerReload } = await load();
    render(<BuildSkewBanner />);

    act(() => {
      offerReload(buildId + 1);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('A newer version of Tau is available');
    expect(isReloadOffered()).toBe(true);
    expect(isBuildSuperseded()).toBe(false);
  });

  it("withdraws a deploy's reload offer when the server names this build through the recovery", async () => {
    const { buildId, isReloadOffered, offerReload, readSupersedingBuildId, queryLiveBuild } = await load();
    act(() => {
      offerReload(buildId + 1);
    });

    await serverSays(queryLiveBuild, buildId);

    expect(isReloadOffered()).toBe(false);
    expect(readSupersedingBuildId()).toBe(buildId);
  });

  it('records the live build for the prompt without superseding this tab yet', async () => {
    const { buildId, isBuildSuperseded, readSupersedingBuildId, queryLiveBuild } = await load();

    await serverSays(queryLiveBuild, buildId - 1);

    expect(readSupersedingBuildId()).toBe(buildId - 1);
    expect(isBuildSuperseded()).toBe(false);
  });

  it('leaves an equal or older build untouched', async () => {
    const { BuildSkewBanner, buildId, isBuildSuperseded } = await load();
    answerLiveBuild('unreachable');
    render(<BuildSkewBanner />);

    announce(buildId);
    announce(buildId - 1);
    await pause();

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

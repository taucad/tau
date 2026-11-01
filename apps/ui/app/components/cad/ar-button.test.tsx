import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Artifact } from '@taucad/runtime';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ArButton } from '#components/cad/ar-button.js';
import { UsdzTranscodeError } from '#components/cad/ar-usdz-transcode.js';
import type * as UsdzTranscodeModule from '#components/cad/ar-usdz-transcode.js';

// WebGL is unavailable in jsdom, so the Three.js scene is the one simulated boundary; the session, overlay, capability
// detection and recovery all run for real against faked platform globals.
const sceneMocks = vi.hoisted(() => ({
  present: vi.fn<(session: unknown, glb: Uint8Array<ArrayBuffer>) => Promise<() => void>>(async () => () => undefined),
}));

vi.mock('#components/cad/ar-webxr-scene.js', () => ({
  presentGlbInArSession: sceneMocks.present,
}));

// The USDZ worker is the second simulated boundary: jsdom has no module workers. Its own test covers the worker client.
const usdzMocks = vi.hoisted(() => ({
  transcode: vi.fn<(glb: Uint8Array<ArrayBuffer>) => Promise<Uint8Array<ArrayBuffer>>>(),
}));

vi.mock('#components/cad/ar-usdz-transcode.js', async (importOriginal) => ({
  ...(await importOriginal<typeof UsdzTranscodeModule>()),
  transcodeGlbToUsdz: usdzMocks.transcode,
}));

const ua = {
  iPhoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iPadDesktopSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
} as const;

class FakeXrSession extends EventTarget {
  public readonly end = vi.fn(async () => {
    this.dispatchEvent(new Event('end'));
  });
}

type Platform = Readonly<{
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** What `a.relList.supports('ar')` answers. */
  relListAr: boolean;
  /** Whether `navigator.xr` exists and what `isSessionSupported('immersive-ar')` answers. */
  xr?: { immersiveAr: boolean };
}>;

const platforms = {
  iPhoneSafari: { userAgent: ua.iPhoneSafari, platform: 'iPhone', maxTouchPoints: 5, relListAr: true },
  iPadOsDesktopUa: { userAgent: ua.iPadDesktopSafari, platform: 'MacIntel', maxTouchPoints: 5, relListAr: true },
  macSafari: { userAgent: ua.iPadDesktopSafari, platform: 'MacIntel', maxTouchPoints: 0, relListAr: true },
  androidChromeWebXr: {
    userAgent: ua.androidChrome,
    platform: 'Linux armv8l',
    maxTouchPoints: 5,
    relListAr: false,
    xr: { immersiveAr: true },
  },
  androidChromeNoWebXr: { userAgent: ua.androidChrome, platform: 'Linux armv8l', maxTouchPoints: 5, relListAr: false },
  androidChromeNoArSession: {
    userAgent: ua.androidChrome,
    platform: 'Linux armv8l',
    maxTouchPoints: 5,
    relListAr: false,
    xr: { immersiveAr: false },
  },
  desktopChrome: {
    userAgent: ua.desktopChrome,
    platform: 'Win32',
    maxTouchPoints: 0,
    relListAr: false,
    xr: { immersiveAr: false },
  },
} satisfies Record<string, Platform>;

const xr = {
  isSessionSupported: vi.fn<(mode: string) => Promise<boolean>>(),
  requestSession: vi.fn<(mode: string, init: XRSessionInit) => Promise<FakeXrSession>>(),
};
let session: FakeXrSession;
const overriddenNavigatorKeys = ['userAgent', 'platform', 'maxTouchPoints', 'xr', 'sendBeacon'] as const;

function installPlatform(platform: Platform): void {
  const define = (key: (typeof overriddenNavigatorKeys)[number], value: unknown): void => {
    Object.defineProperty(navigator, key, { value, configurable: true });
  };
  define('userAgent', platform.userAgent);
  define('platform', platform.platform);
  define('maxTouchPoints', platform.maxTouchPoints);
  vi.spyOn(DOMTokenList.prototype, 'supports').mockImplementation((token) => token === 'ar' && platform.relListAr);
  if (platform.xr) {
    const { immersiveAr } = platform.xr;
    xr.isSessionSupported.mockImplementation(async (mode) => mode === 'immersive-ar' && immersiveAr);
    define('xr', xr);
    // WebXR's session constructor, probed for hit testing.
    vi.stubGlobal(
      'XRSession',
      class {
        public requestHitTestSource(): undefined {
          return undefined;
        }
      },
    );
  }
}

/** Every channel that could carry geometry off the device. */
const network = {
  fetch: vi.fn<typeof fetch>(),
  xhrOpen: vi.fn(),
  sendBeacon: vi.fn(),
  windowOpen: vi.fn(),
};
/** The links the launch clicked, as rel and href. */
let clickedLinks: Array<{ rel: string; href: string }> = [];

beforeEach(() => {
  session = new FakeXrSession();
  xr.isSessionSupported.mockReset();
  xr.requestSession.mockReset().mockImplementation(async () => session);
  sceneMocks.present.mockReset().mockImplementation(async () => () => undefined);
  usdzMocks.transcode.mockReset().mockImplementation(async () => new Uint8Array([1, 2, 3]));
  clickedLinks = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clickedLinks.push({ rel: this.rel, href: this.getAttribute('href') ?? '' });
  });
  URL.createObjectURL = vi.fn(() => 'blob:http://localhost/0f6b6a52');
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('fetch', network.fetch);
  vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(network.xhrOpen);
  Object.defineProperty(navigator, 'sendBeacon', { value: network.sendBeacon, configurable: true });
  vi.spyOn(globalThis, 'open').mockImplementation(network.windowOpen);
});

afterEach(() => {
  for (const key of overriddenNavigatorKeys) {
    Reflect.deleteProperty(navigator, key);
  }

  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const channel of Object.values(network)) {
    channel.mockReset();
  }
});

const glbBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]);
const glbArtifact: Artifact = { mimeType: 'model/gltf-binary', content: glbBytes };

function deferred<Value>(): {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
  readonly reject: (error: unknown) => void;
} {
  let resolve: (value: Value) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<Value>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve, reject };
}

/** Let client-side capability detection settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

function renderAr(artifact: Artifact | undefined = glbArtifact): void {
  render(
    <>
      <button type='button'>Before</button>
      <ArButton artifact={artifact} />
    </>,
    { wrapper: TooltipProvider },
  );
}

const arButton = (): HTMLElement => screen.getByRole('button', { name: 'View in your space' });

function expectNoGeometryLeftTheDevice(): void {
  expect(network.fetch).not.toHaveBeenCalled();
  expect(network.xhrOpen).not.toHaveBeenCalled();
  expect(network.sendBeacon).not.toHaveBeenCalled();
  expect(network.windowOpen).not.toHaveBeenCalled();
  // No Scene Viewer intent or remote model URL: only a same-origin blob may be handed to an AR viewer.
  for (const link of clickedLinks) {
    expect(link.href).toMatch(/^blob:http:\/\/localhost\//);
  }
}

describe('ArButton capability detection', () => {
  it.each([
    { name: 'iPhone Safari (Quick Look)', platform: platforms.iPhoneSafari, isShown: true },
    {
      name: 'iPadOS Safari with a desktop user agent (Quick Look)',
      platform: platforms.iPadOsDesktopUa,
      isShown: true,
    },
    { name: 'macOS Safari without touch', platform: platforms.macSafari, isShown: false },
    { name: 'Android Chrome with WebXR immersive-ar', platform: platforms.androidChromeWebXr, isShown: true },
    { name: 'Android Chrome without WebXR', platform: platforms.androidChromeNoWebXr, isShown: false },
    {
      name: 'Android Chrome whose WebXR lacks immersive-ar',
      platform: platforms.androidChromeNoArSession,
      isShown: false,
    },
    { name: 'desktop Chrome', platform: platforms.desktopChrome, isShown: false },
  ])('$name → shown: $isShown', async ({ platform, isShown }) => {
    installPlatform(platform);
    renderAr();
    await settle();
    if (isShown) {
      expect(arButton()).toBeInTheDocument();
    } else {
      expect(screen.queryByRole('button', { name: /view in your space/i })).not.toBeInTheDocument();
    }
  });

  it('stays hidden when the WebXR session constructor has no hit testing', async () => {
    installPlatform(platforms.androidChromeWebXr);
    vi.stubGlobal('XRSession', { prototype: {} });
    renderAr();
    await settle();
    expect(screen.queryByRole('button', { name: /view in your space/i })).not.toBeInTheDocument();
  });

  it('stays hidden on a supported device until there is a GLB model to open', async () => {
    installPlatform(platforms.androidChromeWebXr);
    renderAr({ mimeType: 'image/svg+xml', content: '<svg />' });
    await settle();
    expect(screen.queryByRole('button', { name: /view in your space/i })).not.toBeInTheDocument();
  });

  it('stays hidden for Quick Look until there is a GLB model to convert', async () => {
    installPlatform(platforms.iPhoneSafari);
    renderAr({ mimeType: 'image/svg+xml', content: '<svg />' });
    await settle();
    expect(screen.queryByRole('button', { name: /view in your space/i })).not.toBeInTheDocument();
  });

  it('is icon-only, named and titled "View in your space"', async () => {
    installPlatform(platforms.iPhoneSafari);
    renderAr();
    await settle();
    const button = arButton();
    // The only text is the glyph's "AR" mark, inside the hidden SVG, so the accessible name stays the label.
    const glyph = button.querySelector('svg');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(glyph).toHaveTextContent('AR');
    expect(button).toHaveTextContent('AR');
    expect(button).toHaveAccessibleName('View in your space');
    await userEvent.hover(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('View in your space');
  });
});

describe('ArButton launch path', () => {
  it('opens Quick Look on iPadOS with a USDZ blob converted from the viewer GLB, and no WebXR session', async () => {
    installPlatform(platforms.iPadOsDesktopUa);
    renderAr();
    await settle();
    await userEvent.click(arButton());

    await waitFor(() => {
      expect(clickedLinks).toEqual([{ rel: 'ar', href: 'blob:http://localhost/0f6b6a52' }]);
    });
    expect(usdzMocks.transcode).toHaveBeenCalledExactlyOnceWith(glbBytes);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/0f6b6a52');
    expect(xr.requestSession).not.toHaveBeenCalled();
    expect(arButton()).toHaveFocus();
    expectNoGeometryLeftTheDevice();
  });

  it('opens an in-page WebXR session on Android with the GLB bytes, then restores the control and focus', async () => {
    installPlatform(platforms.androidChromeWebXr);
    renderAr();
    await settle();
    await userEvent.click(arButton());

    const exit = await screen.findByRole('button', { name: 'Exit AR' });
    expect(xr.requestSession).toHaveBeenCalledWith(
      'immersive-ar',
      expect.objectContaining({ domOverlay: { root: exit.parentElement } }),
    );
    expect(sceneMocks.present).toHaveBeenCalledWith(session, glbBytes, expect.anything());
    expect(usdzMocks.transcode).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('tap to place the model');
    // While presenting, the control keeps its one name and reports itself busy.
    expect(arButton()).toHaveAttribute('aria-busy', 'true');
    expect(arButton()).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(exit);
    expect(session.end).toHaveBeenCalled();
    await waitFor(() => {
      expect(arButton()).toHaveFocus();
    });
    expect(screen.queryByRole('button', { name: 'Exit AR' })).not.toBeInTheDocument();
    expectNoGeometryLeftTheDevice();
  });

  it('restores the control and focus when the system ends the session', async () => {
    installPlatform(platforms.androidChromeWebXr);
    renderAr();
    await settle();
    await userEvent.click(arButton());
    await screen.findByRole('button', { name: 'Exit AR' });

    act(() => {
      session.dispatchEvent(new Event('end'));
    });
    await waitFor(() => {
      expect(arButton()).toHaveFocus();
    });
    expect(screen.queryByRole('button', { name: 'Exit AR' })).not.toBeInTheDocument();
  });

  it('ignores taps while the USDZ conversion is pending, keeping focus on the busy control', async () => {
    installPlatform(platforms.iPhoneSafari);
    const conversion = deferred<Uint8Array<ArrayBuffer>>();
    usdzMocks.transcode.mockImplementationOnce(async () => conversion.promise);
    renderAr();
    await settle();
    await userEvent.click(arButton());

    // Label, tooltip and accessible name stay "View in your space" (I6); busy is told by aria-busy.
    const busy = arButton();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).toHaveFocus();
    await userEvent.click(busy);
    expect(usdzMocks.transcode).toHaveBeenCalledTimes(1);

    await act(async () => {
      conversion.resolve(new Uint8Array([1]));
    });
    expect(arButton()).toHaveFocus();
    expect(arButton()).toHaveAttribute('aria-busy', 'false');
  });

  it('requests the WebXR session synchronously within the click, before any await', async () => {
    installPlatform(platforms.androidChromeWebXr);
    renderAr();
    await settle();

    // `fireEvent.click` dispatches synchronously: the request must already be made when it returns, because the
    // browser grants an AR session only within the click's user activation.
    fireEvent.click(arButton());
    expect(xr.requestSession).toHaveBeenCalledTimes(1);
    await screen.findByRole('button', { name: 'Exit AR' });
  });

  it('keeps the overlay in the DOM but invisible until the session is granted', async () => {
    installPlatform(platforms.androidChromeWebXr);
    const request = deferred<FakeXrSession>();
    xr.requestSession.mockImplementationOnce(async () => request.promise);
    renderAr();
    await settle();
    fireEvent.click(arButton());

    const overlay = document.querySelector<HTMLElement>('[data-slot="ar-session-overlay"]');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveStyle({ visibility: 'hidden' });
    await act(async () => {
      request.resolve(session);
    });
    expect(await screen.findByRole('button', { name: 'Exit AR' })).toBeVisible();
    expect(overlay?.style.visibility).toBe('');
  });

  it('disposes the scene when the session ends', async () => {
    installPlatform(platforms.androidChromeWebXr);
    const dispose = vi.fn();
    sceneMocks.present.mockImplementationOnce(async () => dispose);
    renderAr();
    await settle();
    await userEvent.click(arButton());
    await userEvent.click(await screen.findByRole('button', { name: 'Exit AR' }));

    await waitFor(() => {
      expect(dispose).toHaveBeenCalledTimes(1);
    });
  });

  it('still removes the overlay, clears presenting and restores focus when the scene disposer throws', async () => {
    installPlatform(platforms.androidChromeWebXr);
    sceneMocks.present.mockImplementationOnce(async () => () => {
      throw new Error('Context already lost');
    });
    renderAr();
    await settle();
    await userEvent.click(arButton());
    await userEvent.click(await screen.findByRole('button', { name: 'Exit AR' }));

    await waitFor(() => {
      expect(arButton()).toHaveFocus();
    });
    expect(arButton()).toHaveAttribute('aria-busy', 'false');
    expect(document.querySelector('[data-slot="ar-session-overlay"]')).not.toBeInTheDocument();
  });

  it('ends a session that resolves after the viewer unmounted', async () => {
    installPlatform(platforms.androidChromeWebXr);
    const request = deferred<FakeXrSession>();
    xr.requestSession.mockImplementationOnce(async () => request.promise);
    const { unmount } = render(<ArButton artifact={glbArtifact} />, {
      wrapper: TooltipProvider,
    });
    await settle();
    fireEvent.click(arButton());
    unmount();

    await act(async () => {
      request.resolve(session);
    });
    await waitFor(() => {
      expect(session.end).toHaveBeenCalled();
    });
    expect(document.querySelector('[data-slot="ar-session-overlay"]')).not.toBeInTheDocument();
  });

  it('ends a session the viewer unmounted from while the model loaded', async () => {
    installPlatform(platforms.androidChromeWebXr);
    const load = deferred<() => void>();
    sceneMocks.present.mockImplementationOnce(async () => load.promise);
    const { unmount } = render(<ArButton artifact={glbArtifact} />, {
      wrapper: TooltipProvider,
    });
    await settle();
    await userEvent.click(arButton());
    await screen.findByRole('button', { name: 'Exit AR' });

    unmount();
    await waitFor(() => {
      expect(session.end).toHaveBeenCalled();
    });
    await act(async () => {
      load.reject(new Error('Aborted: the session ended'));
    });
    expect(document.querySelector('[data-slot="ar-session-overlay"]')).not.toBeInTheDocument();
  });

  it('treats Exit during the model load as a return, not a failed launch', async () => {
    installPlatform(platforms.androidChromeWebXr);
    const load = deferred<() => void>();
    sceneMocks.present.mockImplementationOnce(async () => load.promise);
    renderAr();
    await settle();
    await userEvent.click(arButton());
    await userEvent.click(await screen.findByRole('button', { name: 'Exit AR' }));

    await act(async () => {
      load.reject(new Error('Aborted: the session ended'));
    });
    await waitFor(() => {
      expect(arButton()).toHaveFocus();
    });
    expect(arButton()).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('ArButton recovery', () => {
  it('names a denied camera permission, and Dismiss returns focus to the control', async () => {
    installPlatform(platforms.androidChromeWebXr);
    xr.requestSession.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
    renderAr();
    await settle();
    await userEvent.click(arButton());

    const dialog = await screen.findByRole('alertdialog', { name: 'Camera access is off' });
    expect(dialog).toHaveAccessibleDescription(/allow camera access for this site/i);
    expect(screen.queryByRole('button', { name: 'Exit AR' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(arButton()).toHaveFocus();
    expectNoGeometryLeftTheDevice();
  });

  it('names an unsupported session, and Try again launches it', async () => {
    installPlatform(platforms.androidChromeWebXr);
    xr.requestSession.mockRejectedValueOnce(new DOMException('No AR runtime', 'NotSupportedError'));
    renderAr();
    await settle();
    await userEvent.click(arButton());

    await screen.findByRole('alertdialog', { name: 'AR isn’t available right now' });
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Exit AR' })).toBeInTheDocument();
    expect(xr.requestSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps a retry’s own failure open when the session refuses again at once', async () => {
    installPlatform(platforms.androidChromeWebXr);
    xr.requestSession
      .mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'))
      .mockRejectedValueOnce(new DOMException('No AR runtime', 'NotSupportedError'));
    renderAr();
    await settle();
    await userEvent.click(arButton());

    await screen.findByRole('alertdialog', { name: 'Camera access is off' });
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByRole('alertdialog', { name: 'AR isn’t available right now' });
    // The first failure's focus return runs a task after it closes; it must not dismiss the second.
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    });
    expect(screen.getByRole('alertdialog', { name: 'AR isn’t available right now' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(arButton()).toHaveFocus();
    expect(xr.requestSession).toHaveBeenCalledTimes(2);
  });

  it('names a failed USDZ conversion with its message, and Escape returns focus to the control', async () => {
    installPlatform(platforms.iPhoneSafari);
    usdzMocks.transcode.mockRejectedValueOnce(new UsdzTranscodeError('Assimp cannot write USDZ'));
    renderAr();
    await settle();
    await userEvent.click(arButton());

    const dialog = await screen.findByRole('alertdialog', { name: 'Couldn’t prepare the model for AR' });
    expect(dialog).toHaveAccessibleDescription('Assimp cannot write USDZ');
    expect(clickedLinks).toEqual([]);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(arButton()).toHaveFocus();
  });

  it('ends the session and names a failed launch when the model cannot be shown', async () => {
    installPlatform(platforms.androidChromeWebXr);
    sceneMocks.present.mockRejectedValueOnce(new Error('Invalid glTF binary'));
    renderAr();
    await settle();
    await userEvent.click(arButton());

    const dialog = await screen.findByRole('alertdialog', { name: 'Couldn’t open AR' });
    expect(dialog).toHaveAccessibleDescription('Invalid glTF binary');
    expect(session.end).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Exit AR' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(arButton()).toHaveFocus();
  });
});

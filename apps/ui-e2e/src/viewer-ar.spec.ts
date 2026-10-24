import { describe, expect, it } from 'vitest';
import { page as selectors } from 'vitest/browser';
import type { Locator } from 'vitest/browser';
import * as target from '#support/external-target.js';

/**
 * AR reach in the real app (charter W5, acceptance T9): the control appears only where a launch path exists, each
 * failed launch is named with Try again and Dismiss and gives focus back to the control, and no launch sends the model
 * off the device. Chromium has no AR runtime, so the platform is emulated with init scripts; physical Quick Look and
 * WebXR stay with the MOB-5 device ledger.
 */

const fixtureRoute = '/__e2e/example-fixture?locator=jscad.section-picking-fixture&graphicsBackend=webgl';
const phone = { width: 390, height: 844 } as const;

const arButton = (): Locator => selectors.getByRole('button', { name: 'View in your space', exact: true });
const alert = (name: string): Locator => selectors.getByRole('alertdialog', { name });

type ArProbe = {
  /** Requests whose body went to another origin, or carried a GLB or USDZ payload, after the probe armed. */
  offDevice: string[];
  /** Links an AR launch clicked, as `rel href`. */
  links: string[];
  /** The USDZ blobs handed to `URL.createObjectURL`: type, size and first four bytes (a zip's `PK\x03\x04`). */
  usdz: Array<{ type: string; size: number; magic: number[] }>;
  sessionRequests: number;
};

/**
 * Records every outbound channel after the AR control is first tapped, and the links a launch clicks (without
 * following them), into `window.__arProbe`.
 */
function installArProbe(): void {
  const probe: ArProbe = { offDevice: [], links: [], usdz: [], sessionRequests: 0 };
  Object.assign(globalThis, { __arProbe: probe });
  const isOffDevice = (url: string, body: unknown): boolean => {
    const isCrossOrigin = new URL(url, location.href).origin !== location.origin;
    const isModel = body instanceof Blob && /model\/(gltf-binary|vnd\.usdz)/.test(body.type);
    return (isCrossOrigin && body !== undefined && body !== null) || isModel || url.startsWith('intent:');
  };
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (isOffDevice(url, init?.body)) {
      probe.offDevice.push(`fetch ${url}`);
    }
    return nativeFetch(input, init);
  };
  const nativeBeacon = navigator.sendBeacon.bind(navigator);
  navigator.sendBeacon = (url, data) => {
    if (isOffDevice(String(url), data)) {
      probe.offDevice.push(`beacon ${String(url)}`);
    }
    return nativeBeacon(url, data);
  };
  const nativeOpen = globalThis.open.bind(globalThis);
  globalThis.open = (url, ...rest) => {
    probe.offDevice.push(`open ${String(url)}`);
    return nativeOpen(url, ...rest);
  };
  const nativeCreateObjectUrl = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (object) => {
    if (object instanceof Blob && object.type === 'model/vnd.usdz+zip') {
      const record = { type: object.type, size: object.size, magic: [] as number[] };
      probe.usdz.push(record);
      const readMagic = async (): Promise<void> => {
        record.magic = [...new Uint8Array(await object.slice(0, 4).arrayBuffer())];
      };
      // async-iife: bootstrap -- the probe is polled until the bytes land.
      void readMagic();
    }
    return nativeCreateObjectUrl(object);
  };
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    probe.links.push(`${this.rel} ${this.href}`);
  };
}

/** Emulates supported Android Chrome: `immersive-ar` with hit testing, whose session requests fail in turn. */
function emulateAndroidWebXr(failures: readonly string[]): void {
  const pending = [...failures];
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- runs in the page, where installArProbe set __arProbe; a global declaration would leak into every spec in this project.
  const probe = (globalThis as unknown as { __arProbe: ArProbe }).__arProbe;
  Object.defineProperty(globalThis, 'XRSession', {
    configurable: true,
    value: class {
      public requestHitTestSource(): undefined {
        return undefined;
      }
    },
  });
  Object.defineProperty(navigator, 'xr', {
    configurable: true,
    value: {
      isSessionSupported: async (mode: string) => mode === 'immersive-ar',
      requestSession: async () => {
        probe.sessionRequests += 1;
        throw new DOMException('Emulated session failure', pending.shift() ?? 'NotSupportedError');
      },
    },
  });
}

/** Emulates iPadOS Safari, which reports a Mac user agent with touch points and answers `relList.supports('ar')`. */
function emulateIpadSafari(): void {
  Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' });
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  });
  const nativeSupports = DOMTokenList.prototype.supports;
  DOMTokenList.prototype.supports = function (this: DOMTokenList, token: string) {
    return token === 'ar' || nativeSupports.call(this, token);
  };
}

async function openViewer(): Promise<void> {
  await target.commands.uiOpenTarget({ hasTouch: true, isMobile: true });
  await target.addInitScript(installArProbe);
}

async function showModel(viewport: { width: number; height: number }): Promise<void> {
  await target.setViewport(viewport);
  await target.navigate(fixtureRoute);
  await target.expectVisible(selectors.getByCss('canvas[data-engine]'), 60_000);
  await target.expectGeometryFramed();
}

async function readProbe(): Promise<ArProbe> {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- runs in the page, where installArProbe set __arProbe; a global declaration would leak into every spec in this project.
  return target.evaluate(() => (globalThis as unknown as { __arProbe: ArProbe }).__arProbe);
}

describe('viewer AR', () => {
  it('stays hidden on a phone without an AR launch path', async () => {
    await openViewer();
    await showModel(phone);
    await target.expectVisible(selectors.getByRole('button', { name: 'Fit view' }));
    await target.expectCount(arButton(), 0);
  });

  it('names denied and unsupported WebXR launches, retries, and returns focus without sending the model away', async () => {
    await openViewer();
    await target.addInitScript(emulateAndroidWebXr, ['NotAllowedError', 'NotSupportedError']);
    await showModel(phone);

    await target.expectVisible(arButton(), 30_000);
    await target.click(arButton(), { touch: true });
    await target.expectVisible(alert('Camera access is off'));
    await target.click(selectors.getByRole('button', { name: 'Try again' }), { touch: true });
    await target.expectVisible(alert('AR isn’t available right now'));
    await target.click(selectors.getByRole('button', { name: 'Dismiss' }), { touch: true });

    await target.expectCount(selectors.getByRole('alertdialog'), 0);
    await target.expectFocused(arButton());
    const probe = await readProbe();
    expect(probe.sessionRequests).toBe(2);
    expect(probe.offDevice).toEqual([]);
    expect(probe.links).toEqual([]);
  });

  // The UI runtime registers `jscad()` and `assimp({ preset: 'all' })`, whose export transcoder turns the fixture's GLB
  // into USDZ in the browser's WebAssembly build, so this runs the real export pipeline end to end.
  it.each([
    { layout: 'phone layout', viewport: phone },
    { layout: 'desktop layout an iPad keeps (D12)', viewport: { width: 1024, height: 1366 } },
  ])(
    'opens Quick Look with the iPadOS desktop user agent in the $layout from a USDZ exported in the page',
    async ({ viewport }) => {
      await openViewer();
      await target.addInitScript(emulateIpadSafari);
      await showModel(viewport);
      if (viewport.width >= 768) {
        // The desktop bar keeps Fullscreen and adds AR after it.
        await target.expectVisible(selectors.getByRole('button', { name: 'Enter fullscreen' }));
      }

      await target.expectVisible(arButton(), 30_000);
      await target.click(arButton(), { touch: true });
      const origin = await target.evaluate(() => location.origin);
      await expect
        .poll(
          async () => {
            const { links } = await readProbe();
            return links;
          },
          { timeout: 60_000 },
        )
        .toEqual([expect.stringMatching(new RegExp(`^ar blob:${origin}/`, 'u'))]);
      await expect
        .poll(async () => {
          const { usdz } = await readProbe();
          return usdz;
        })
        .toEqual([expect.objectContaining({ type: 'model/vnd.usdz+zip', magic: [0x50, 0x4b, 0x03, 0x04] })]);
      await target.expectFocused(arButton());
      await target.expectCount(selectors.getByRole('alertdialog'), 0);
      const { offDevice } = await readProbe();
      expect(offDevice).toEqual([]);
    },
  );
});

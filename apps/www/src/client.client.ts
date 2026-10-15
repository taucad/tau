import { detectDesktopPlatform, desktopDownloads, desktopDownloadHref, desktopDownloadLabel } from '#www/downloads.js';
import type * as Live from '#www/live.js';
import { readStoryProgress } from '#www/story-progress.js';
import { randomUuid } from '@taucad/utils/id';
import { sanitizeEvent, campaignCodes } from '#www/analytics.js';
import { environmentHref, stagingDesktopNote } from '#www/environment.js';
import { consentChannelName, readConsentCookie, writeConsent } from '@taucad/consent';
import type { ConsentDecision } from '@taucad/consent';

export function initializePage(signal: AbortSignal): () => void {
  const cleanups: Array<() => void> = [];
  document.body.dataset['page'] = location.pathname;
  for (const link of document.querySelectorAll('a[href^="https://"]')) {
    link.setAttribute('href', environmentHref(link.getAttribute('href') ?? '', location.hostname));
  }
  const hostPlatform = detectDesktopPlatform(navigator);
  if (hostPlatform) {
    const download = desktopDownloads[hostPlatform];
    for (const link of document.querySelectorAll('[data-host-download]')) {
      link.innerHTML = desktopDownloadLabel(hostPlatform);
      if (link instanceof HTMLElement && link.dataset['hostDownload'] === 'direct') {
        link.setAttribute('href', environmentHref(desktopDownloadHref(hostPlatform), location.hostname));
      }
    }
    const intelDownload = document.querySelector('[data-mac-intel]');
    if (intelDownload instanceof HTMLElement) {
      intelDownload.hidden = hostPlatform !== 'mac';
    }
    const detail = document.querySelector('[data-download-detail]');
    const instructions = document.querySelector('[data-install-instructions]');
    const note = document.querySelector('[data-platform-note]');
    if (detail) {
      detail.textContent = download.detail;
    }
    if (instructions) {
      instructions.textContent = download.install;
    }
    if (note) {
      note.textContent =
        (hostPlatform === 'mac' ? stagingDesktopNote(location.hostname) : undefined) ?? download.updates;
    }
  }

  const mobileMenu = document.querySelector('.mobile-menu');
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && mobileMenu instanceof HTMLDetailsElement && mobileMenu.open) {
        mobileMenu.open = false;
        mobileMenu.querySelector('summary')?.focus();
      }
    },
    { signal },
  );

  const visitKey = 'tau-www-visited-v1';
  /**
   * @param key - Optional local storage key.
   */
  const safeRead: (key: string) => string | undefined = (key): string | undefined => {
    try {
      return localStorage.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  };
  /**
   * @param key - Optional local storage key.
   * @param value - Stored preference.
   */
  const safeWrite: (key: string, value: string) => void = (key, value): void => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Tracking remains optional. */
    }
  };
  /**
   * @param key - Optional local storage key.
   */
  const safeRemove: (key: string) => void = (key): void => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Restricted storage. */
    }
  };
  const endpoint = document.body.dataset['analyticsEndpoint'];
  const permittedEndpoint = endpoint === '/api/marketing-events' ? endpoint : undefined;
  const panel = document.querySelector('.consent');
  const preferenceButtons = [...document.querySelectorAll('[data-consent-open]')].filter(
    (button): button is HTMLButtonElement => button instanceof HTMLButtonElement,
  );
  const privacyReset = document.querySelector('[data-consent-reset]');
  const privacySignal =
    ('globalPrivacyControl' in navigator && navigator.globalPrivacyControl === true) || navigator.doNotTrack === '1';
  /** The shared cookie is authoritative; the former site-only record is migrated once. */
  const legacyConsentKey = 'tau-www-analytics-consent-v1';
  const readConsent = (): ConsentDecision | undefined => {
    const status = readConsentCookie(document.cookie);
    return status === 'unknown' ? undefined : status;
  };
  let consent = readConsent();
  const legacy = safeRead(legacyConsentKey);
  if (consent === undefined && !privacySignal && (legacy === 'accepted' || legacy === 'denied')) {
    consent = legacy === 'accepted' ? 'accepted' : 'declined';
    writeConsent(consent);
  }
  safeRemove(legacyConsentKey);
  let pageSent = false;

  const controllerSet = new Set<AbortController>();

  const clicks = new Set<string>();
  const campaign = new URLSearchParams(location.search).get('utm_campaign');
  const safeCampaign = campaign !== null && campaignCodes.has(campaign) ? campaign : undefined;
  const returning = safeRead(visitKey) === 'yes';
  /**
   * Send optional analytics without allowing transport failure to affect navigation.
   * @param event - Allowed event intent.
   * @returns Settles after transport or an ignored optional failure.
   */
  const send: (event: { name: string; placement?: string }) => Promise<void> = async ({
    name,
    placement,
  }): Promise<void> => {
    if (!permittedEndpoint || consent !== 'accepted' || privacySignal) {
      return;
    }
    const controller = new AbortController();
    signal.addEventListener(
      'abort',
      () => {
        controller.abort();
      },
      { once: true },
    );
    controllerSet.add(controller);
    try {
      const payload = sanitizeEvent({
        name,
        page: document.body.dataset['page'],
        placement,
        campaign: safeCampaign,
        returning,
        eventId: randomUuid(),
      });
      if (!payload) {
        return;
      }
      await fetch(permittedEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        keepalive: true,
        signal: controller.signal,
      });
    } catch {
      // Analytics failure never interrupts navigation, including unavailable browser crypto.
    } finally {
      controllerSet.delete(controller);
    }
  };
  const pageView = () => {
    if (pageSent || consent !== 'accepted' || privacySignal || !permittedEndpoint) {
      return;
    }
    pageSent = true;
    void send({ name: 'marketing_page_view' });
    safeWrite(visitKey, 'yes');
  };
  // The choice also governs the Tau app's analytics, so it is offered whether or not this site measures anything.
  if (!privacySignal && panel instanceof HTMLElement) {
    panel.hidden = consent !== undefined;
    for (const button of preferenceButtons) {
      button.hidden = false;
      button.disabled = false;
    }
    pageView();
  }
  for (const button of preferenceButtons) {
    button.addEventListener(
      'click',
      () => {
        if (panel instanceof HTMLElement) {
          panel.hidden = false;
          panel.querySelector('button')?.focus();
        }
      },
      { signal },
    );
  }
  panel?.addEventListener(
    'click',
    (event) => {
      const button = event.target instanceof Element ? event.target.closest('button[data-consent]') : null;
      if (!(panel instanceof HTMLElement) || !(button instanceof HTMLButtonElement) || !panel.contains(button)) {
        return;
      }
      const selectedConsent = button.dataset['consent'];
      if (selectedConsent !== 'accepted' && selectedConsent !== 'declined') {
        return;
      }
      consent = selectedConsent;
      writeConsent(consent);
      if (consent === 'declined') {
        for (const controller of controllerSet) {
          controller.abort();
        }
        safeRemove(visitKey);
      }
      panel.hidden = true;
      pageView();
    },
    { signal },
  );
  privacyReset?.addEventListener(
    'click',
    () => {
      consent = undefined;
      for (const controller of controllerSet) {
        controller.abort();
      }
      writeConsent(undefined);
      safeRemove(visitKey);
      const status = document.querySelector('#privacy-status');
      if (status) {
        status.textContent = 'Your analytics preference and local visit marker have been cleared. Analytics is off.';
      }
      if (!privacySignal && panel instanceof HTMLElement) {
        panel.hidden = false;
      }
    },
    { signal },
  );
  if (privacyReset instanceof HTMLButtonElement) {
    privacyReset.disabled = false;
  }
  const consentChannel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(consentChannelName);
  consentChannel?.addEventListener('message', () => {
    consent = readConsent();
    if (consent !== 'accepted') {
      for (const controller of controllerSet) {
        controller.abort();
      }
    }
  });
  signal.addEventListener(
    'abort',
    () => {
      consentChannel?.close();
    },
    { once: true },
  );
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target instanceof Element ? event.target.closest('a[data-event]') : null;
      if (!(target instanceof HTMLAnchorElement) || consent !== 'accepted') {
        return;
      }
      const { placement } = target.dataset;
      const name = target.dataset['event'] === 'download' ? 'marketing_download_click' : 'marketing_cta_click';
      const key = `${name}:${placement}`;
      if (clicks.has(key)) {
        return;
      }
      clicks.add(key);
      void send({ name, placement });
    },
    { signal },
  );

  // Everything below is progressive: the page is complete with static art and text alone.
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const saveData =
    'connection' in navigator &&
    typeof navigator.connection === 'object' &&
    navigator.connection !== null &&
    'saveData' in navigator.connection &&
    navigator.connection.saveData === true;
  const storyStage = document.querySelector('[data-story-stage]');
  const heroStage = document.querySelector('[data-hero-stage]');
  const chapters = [...document.querySelectorAll('[data-story-chapter]')];
  const labels = chapters.map((chapter) => chapter.querySelector('.kicker')?.textContent.trim() ?? '');

  // Still frames follow the reading position whenever the live scene is not running.
  if (storyStage instanceof HTMLElement && chapters.length > 0) {
    const poster = storyStage.querySelector('[data-story-poster]');
    const count = storyStage.querySelector('[data-story-count]');
    let shown = -1;
    let pending = 0;
    const sync = () => {
      pending = 0;
      const chapter = Math.min(chapters.length - 1, Math.floor(readStoryProgress(chapters) + 0.12));
      const live = storyStage.classList.contains('is-live');
      if (poster instanceof HTMLImageElement && !live && poster.dataset['chapter'] !== String(chapter)) {
        poster.dataset['chapter'] = String(chapter);
        poster.src = `/_www/assets/story-${chapter}.webp`;
      }
      if (chapter === shown) {
        return;
      }
      shown = chapter;
      for (const [i, element] of chapters.entries()) {
        element.classList.toggle('is-active', i === chapter);
      }
      storyStage.dataset['chapter'] = String(chapter);
      if (count) {
        count.textContent = `${labels[chapter]?.replace(/^(\d+)\s*/u, '$1 / 09 · ')}`;
      }
    };
    addEventListener(
      'scroll',
      () => {
        pending ||= requestAnimationFrame(sync);
      },
      { signal, passive: true },
    );
    addEventListener('www:still', sync, { signal });
    sync();
    cleanups.push(() => {
      cancelAnimationFrame(pending);
    });
  }

  const capable =
    'WebGL2RenderingContext' in globalThis && 'DecompressionStream' in globalThis && !saveData && !reduced.matches;

  let live: Promise<typeof Live> | undefined;
  let started = false;
  const startLive = async () => {
    if (started) {
      return;
    }
    started = true;
    try {
      live ??= import('#www/live.js');
      const module = await live;
      if (!signal.aborted) {
        await module.start(
          {
            heroStage: heroStage ?? undefined,
            storyStage: storyStage ?? undefined,
            chapters,
          },
          signal,
        );
      }
    } catch {
      for (const stage of [heroStage, storyStage]) {
        if (stage instanceof HTMLElement) {
          stage.dataset['fallback'] = 'true';
        }
      }
    }
  };
  if (capable && (heroStage ?? storyStage)) {
    // A real visitor intent upgrades the poster; first paint never pays for WebGL.
    const activate = document.querySelector<HTMLButtonElement>('[data-activate-hero]');
    if (activate) {
      activate.hidden = false;
      activate.addEventListener(
        'click',
        async () => {
          await startLive();
          if (!signal.aborted) {
            document.querySelector<HTMLElement>('#turn-input')?.focus();
          }
        },
        { signal },
      );
    }
    heroStage?.addEventListener(
      'pointerdown',
      () => {
        void startLive();
      },
      { signal, once: true, passive: true },
    );
    if (storyStage) {
      const near = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            near.disconnect();
            void startLive();
          }
        },
        { rootMargin: '600px 0px' },
      );
      near.observe(storyStage);
      cleanups.push(() => {
        near.disconnect();
      });
    }
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
    for (const controller of controllerSet) {
      controller.abort();
    }
  };
}

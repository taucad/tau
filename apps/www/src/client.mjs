import { readStoryProgress } from '#www/story-progress.js';
import { randomUuid } from '@taucad/utils/id';
import { sanitizeEvent, campaignCodes } from '#www/analytics.js';
import { environmentHref, stagingDesktop } from '#www/environment.js';

for (const link of document.querySelectorAll('a[href^="https://"]')) {
  link.setAttribute('href', environmentHref(link.getAttribute('href') ?? '', location.hostname));
}
const desktop = stagingDesktop(location.hostname);
const desktopLink = document.querySelector('[data-desktop-link]');
const desktopNote = document.querySelector('[data-platform-card="desktop"] [data-platform-note]');
if (desktop && desktopLink instanceof HTMLAnchorElement && desktopNote instanceof HTMLElement) {
  desktopLink.href = desktop.href;
  desktopLink.firstChild?.replaceWith(`${desktop.label} `);
  desktopNote.textContent = desktop.note;
}

const mobileMenu = document.querySelector('.mobile-menu');
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && mobileMenu instanceof HTMLDetailsElement && mobileMenu.open) {
    mobileMenu.open = false;
    mobileMenu.querySelector('summary')?.focus();
  }
});

const consentKey = 'tau-www-analytics-consent-v1';
const visitKey = 'tau-www-visited-v1';
/**
 * @param key - Optional local storage key.
 * @type {(key: string) => string | null}
 */
const safeRead = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
/**
 * @param key - Optional local storage key.
 * @param value - Stored preference.
 * @type {(key: string, value: string) => void}
 */
const safeWrite = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Tracking remains optional. */
  }
};
/**
 * @param key - Optional local storage key.
 * @type {(key: string) => void}
 */
const safeRemove = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Restricted storage. */
  }
};
const endpoint = document.body.dataset['analyticsEndpoint'];
const permittedEndpoint = endpoint === '/api/marketing-events' ? endpoint : undefined;
const panel = document.querySelector('.consent');
const preferenceButton = document.querySelector('[data-consent-open]');
const privacyReset = document.querySelector('[data-consent-reset]');
const privacySignal =
  ('globalPrivacyControl' in navigator && navigator.globalPrivacyControl === true) || navigator.doNotTrack === '1';
let consent = safeRead(consentKey);
let pageSent = false;
/** @type {Set<AbortController>} */
const controllerSet = new Set();
/** @type {Set<string>} */
const clicks = new Set();
const campaign = new URLSearchParams(location.search).get('utm_campaign');
const safeCampaign = campaign !== null && campaignCodes.has(campaign) ? campaign : undefined;
const returning = safeRead(visitKey) === 'yes';
/**
 * Send optional analytics without allowing transport failure to affect navigation.
 * @param event - Allowed event intent.
 * @returns Settles after transport or an ignored optional failure.
 * @type {(event: {name: string, placement?: string}) => Promise<void>}
 */
const send = async ({ name, placement }) => {
  if (!permittedEndpoint || consent !== 'accepted' || privacySignal) {
    return;
  }
  const controller = new AbortController();
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
if (permittedEndpoint && !privacySignal && preferenceButton instanceof HTMLElement && panel instanceof HTMLElement) {
  preferenceButton.hidden = false;
  panel.hidden = consent === 'accepted' || consent === 'denied';
  pageView();
}
preferenceButton?.addEventListener('click', () => {
  if (panel instanceof HTMLElement) {
    panel.hidden = false;
    panel.querySelector('button')?.focus();
  }
});
panel?.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('button[data-consent]') : null;
  if (!(panel instanceof HTMLElement) || !(button instanceof HTMLButtonElement) || !panel.contains(button)) {
    return;
  }
  const selectedConsent = button.dataset['consent'];
  if (selectedConsent !== 'accepted' && selectedConsent !== 'denied') {
    return;
  }
  consent = selectedConsent;
  safeWrite(consentKey, consent);
  if (consent === 'denied') {
    for (const controller of controllerSet) {
      controller.abort();
    }
    safeRemove(visitKey);
  }
  panel.hidden = true;
  pageView();
});
privacyReset?.addEventListener('click', () => {
  consent = null;
  for (const controller of controllerSet) {
    controller.abort();
  }
  safeRemove(consentKey);
  safeRemove(visitKey);
  const status = document.querySelector('#privacy-status');
  if (status) {
    status.textContent = 'Your analytics preference and local visit marker have been cleared. Analytics is off.';
  }
  if (permittedEndpoint && !privacySignal && panel instanceof HTMLElement) {
    panel.hidden = false;
  }
});
globalThis.addEventListener('storage', (event) => {
  if (event.key !== consentKey) {
    return;
  }
  consent = event.newValue;
  if (consent !== 'accepted') {
    for (const controller of controllerSet) {
      controller.abort();
    }
  }
});
document.addEventListener('click', (event) => {
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
});

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
    { passive: true },
  );
  addEventListener('www:still', sync);
  sync();
}

const capable =
  'WebGL2RenderingContext' in globalThis && 'DecompressionStream' in globalThis && !saveData && !reduced.matches;
/** @type {Promise<typeof import('#www/live.js')> | undefined} */
let live;
const startLive = async () => {
  try {
    live ??= import('#www/live.js');
    const module = await live;
    await module.start({ heroStage, storyStage, chapters });
  } catch {
    for (const stage of [heroStage, storyStage]) {
      if (stage instanceof HTMLElement) {
        stage.dataset['fallback'] = 'true';
      }
    }
  }
};
if (capable && (heroStage ?? storyStage)) {
  // Desktop: upgrade the hero once the page has painted and gone idle, never before LCP.
  const idle = (/** @type {() => void} */ run) =>
    'requestIdleCallback' in globalThis ? requestIdleCallback(run, { timeout: 3000 }) : setTimeout(run, 1200);
  if (heroStage && matchMedia('(pointer: fine) and (min-width: 761px)').matches) {
    const kick = () =>
      idle(() => {
        void startLive();
      });
    if (document.readyState === 'complete') {
      kick();
    } else {
      addEventListener('load', kick, { once: true });
    }
  }
  // Touch and narrow screens: load on intent at the hero, or when the story comes near.
  heroStage?.addEventListener(
    'pointerdown',
    () => {
      void startLive();
    },
    { once: true, passive: true },
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
  }
}

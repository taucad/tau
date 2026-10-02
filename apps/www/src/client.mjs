import { randomUuid } from '@taucad/utils/id';
import { sanitizeEvent, campaignCodes } from '#www/analytics.js';

const mobileMenu = document.querySelector('.mobile-menu');
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && mobileMenu instanceof HTMLDetailsElement && mobileMenu.open) {
    mobileMenu.open = false;
    mobileMenu.querySelector('summary')?.focus();
  }
});

// Static art is the fallback. Alternative views are loaded only on intent.
const controls = document.querySelector('.view-controls');
const modelImage = document.querySelector('#assembly-image');
if (controls && modelImage instanceof HTMLImageElement) {
  controls.removeAttribute('aria-hidden');
  controls.classList.add('ready');
  let requestedView = 'exploded';
  controls.addEventListener('click', async (event) => {
    const button = event.target instanceof Element ? event.target.closest('button[data-view]') : null;
    if (!(button instanceof HTMLButtonElement) || !controls.contains(button)) {
      return;
    }
    const selectedView = button.dataset['view'];
    if (selectedView !== 'assembly' && selectedView !== 'exploded') {
      return;
    }
    requestedView = selectedView;
    const view = requestedView;
    const next = new Image();
    next.src = `/_www/assets/${view}.webp`;
    try {
      await next.decode();
    } catch {
      return;
    }
    if (view !== requestedView) {
      return;
    }
    modelImage.removeAttribute('srcset');
    modelImage.src = next.src;
    modelImage.alt =
      view === 'exploded'
        ? 'Exploded view of the authored planetary assembly showing the ring, carrier plates, gears and bearing hardware'
        : 'Assembled view of the authored planetary stage with three planet gears and a blue carrier';
    for (const control of controls.querySelectorAll('button')) {
      control.setAttribute('aria-pressed', String(control === button));
    }
  });
}

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

// Leave the hero and the full reading path static; load 3D only at the story.
const storyStage = document.querySelector('[data-story-stage]');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const saveData =
  'connection' in navigator &&
  typeof navigator.connection === 'object' &&
  navigator.connection !== null &&
  'saveData' in navigator.connection &&
  navigator.connection.saveData === true;
if (
  storyStage instanceof HTMLElement &&
  'DecompressionStream' in globalThis &&
  !motionPreference.matches &&
  !saveData
) {
  let loading = false;
  let departed = false;
  const cannotStart = () => departed || document.hidden || motionPreference.matches;
  const observer = new IntersectionObserver(
    async ([entry]) => {
      if (!entry?.isIntersecting || loading || cannotStart()) {
        return;
      }
      loading = true;
      observer.disconnect();
      try {
        const { mountStory } = await import('#www/story-scene.js');
        if (cannotStart()) {
          return;
        }
        await mountStory(storyStage);
      } catch {
        // The image, chapters and source link remain the complete fallback.
        storyStage.dataset['fallback'] = 'true';
      }
    },
    { threshold: 0.05 },
  );
  observer.observe(storyStage);
  globalThis.addEventListener(
    'pagehide',
    () => {
      departed = true;
      observer.disconnect();
    },
    { once: true },
  );
}

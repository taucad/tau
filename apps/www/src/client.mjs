import { randomUuid } from '@taucad/utils/id';
import { sanitizeEvent, campaignCodes } from './analytics.mjs';

const mobileMenu = document.querySelector('.mobile-menu');
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && mobileMenu.open) {
    mobileMenu.open = false;
    mobileMenu.querySelector('summary').focus();
  }
});

// Static art is the fallback. Alternative views are loaded only on intent.
const controls = document.querySelector('.view-controls');
const modelImage = document.querySelector('#assembly-image');
if (controls && modelImage) {
  controls.removeAttribute('aria-hidden');
  controls.classList.add('ready');
  let requestedView = 'exploded';
  controls.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-view]');
    if (!button || !['assembly', 'exploded'].includes(button.dataset.view)) {
      return;
    }
    requestedView = button.dataset.view;
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
const safeRead = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const safeWrite = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Tracking remains optional. */
  }
};
const safeRemove = (key) => {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Restricted storage. */
  }
};
const endpoint = document.body.dataset.analyticsEndpoint;
const permittedEndpoint = endpoint === '/api/marketing-events' ? endpoint : undefined;
const panel = document.querySelector('.consent');
const preferenceButton = document.querySelector('[data-consent-open]');
const privacyReset = document.querySelector('[data-consent-reset]');
const privacySignal = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
let consent = safeRead(consentKey);
let pageSent = false;
const controllerSet = new Set();
const clicks = new Set();
const campaign = new URLSearchParams(location.search).get('utm_campaign');
const safeCampaign = campaignCodes.has(campaign) ? campaign : undefined;
const returning = safeRead(visitKey) === 'yes';
const send = ({ name, placement }) => {
  if (!permittedEndpoint || consent !== 'accepted' || privacySignal) {
    return;
  }
  const payload = sanitizeEvent({
    name,
    page: document.body.dataset.page,
    placement,
    campaign: safeCampaign,
    returning,
    eventId: randomUuid(),
  });
  if (!payload) {
    return;
  }
  const controller = new AbortController();
  controllerSet.add(controller);
  fetch(permittedEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    keepalive: true,
    signal: controller.signal,
  })
    .catch(() => {
      // Optional analytics transport failures must not interrupt navigation.
    })
    .finally(() => controllerSet.delete(controller));
};
const pageView = () => {
  if (pageSent || consent !== 'accepted' || privacySignal || !permittedEndpoint) {
    return;
  }
  pageSent = true;
  send({ name: 'marketing_page_view' });
  safeWrite(visitKey, 'yes');
};
if (permittedEndpoint && !privacySignal) {
  preferenceButton.hidden = false;
  panel.hidden = consent === 'accepted' || consent === 'denied';
  pageView();
}
preferenceButton.addEventListener('click', () => {
  panel.hidden = false;
  panel.querySelector('button').focus();
});
panel.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-consent]');
  if (!button || !panel.contains(button)) {
    return;
  }
  consent = button.dataset.consent;
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
  document.querySelector('#privacy-status').textContent =
    'Your analytics preference and local visit marker have been cleared. Analytics is off.';
  if (permittedEndpoint && !privacySignal) {
    panel.hidden = false;
  }
});
window.addEventListener('storage', (event) => {
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
  const target = event.target.closest('a[data-event]');
  if (!target || consent !== 'accepted') {
    return;
  }
  const { placement } = target.dataset;
  const name = target.dataset.event === 'download' ? 'marketing_download_click' : 'marketing_cta_click';
  const key = `${name}:${placement}`;
  if (clicks.has(key)) {
    return;
  }
  clicks.add(key);
  send({ name, placement });
});

// Leave the hero and the full reading path static; load 3D only at the story.
const storyStage = document.querySelector('[data-story-stage]');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
if (storyStage && 'DecompressionStream' in window && !motionPreference.matches && !navigator.connection?.saveData) {
  let loading = false;
  const observer = new IntersectionObserver(
    async ([entry]) => {
      if (!entry.isIntersecting || loading || document.hidden || motionPreference.matches) {
        return;
      }
      loading = true;
      observer.disconnect();
      try {
        const { mountStory } = await import('./story-scene.mjs');
        await mountStory(storyStage);
      } catch {
        // The image, chapters and source link remain the complete fallback.
        storyStage.dataset.fallback = 'true';
      }
    },
    { threshold: 0.05 },
  );
  observer.observe(storyStage);
  window.addEventListener(
    'pagehide',
    () => {
      observer.disconnect();
    },
    { once: true },
  );
}

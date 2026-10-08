import { readFileSync } from 'node:fs';
import { appOrigin, docsOrigin } from '#www/environment.js';
import {
  discordUrl,
  ecosystem,
  exampleUrl,
  navigation,
  plans,
  pricingFaq,
  principles,
  salesEmail,
  sourceUrl,
  storyChapters,
  useCases,
  visionChapters,
} from '#www/content.js';
import { heroDrafting } from '#www/hero-view.js';
import { wordmark } from '#www/wordmark.js';
/** @typedef {{path: string, title: string, description: string, error?: boolean, body: () => string}} Page */
/** @typedef {{commit: string, startedAt: string, durationMs: number, summary: {selected: number, passed: number, failed: number, inconclusive: number}, tests: Array<{name: string, status: string, codes: string[]}>}} Evidence */

const brand = `<a class="wordmark" href="/" aria-label="Tau home"><svg viewBox="${wordmark.viewBox}" aria-hidden="true"><path class="wordmark-symbol" fill-rule="evenodd" d="${wordmark.symbol}"/><path fill-rule="evenodd" d="${wordmark.letters}"/></svg></a>`;
const evidence = /** @type {Evidence} */ (
  JSON.parse(readFileSync(new URL('../content/evidence/planetary-geospec-run.json', import.meta.url), 'utf8'))
);

/**
 * @param value - Text to escape for an HTML context.
 * @type {(value: unknown) => string}
 */
export const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const out = '<span class="out" aria-hidden="true">↗</span>';
const down = '<span aria-hidden="true">↓</span>';
/** @type {(label?: string, path?: string, placement?: string) => string} */
const cta = (label = 'Start designing', path = '/projects/new', placement = 'primary') =>
  `<a class="button primary" href="${appOrigin}${path}" data-event="cta" data-placement="${placement}">${label} ${out}</a>`;
/** @type {(text: string) => string} */
const kicker = (text) => `<p class="kicker">${text}</p>`;
/** @type {(options: {eyebrow: string, title: string, body: string, aside?: string}) => string} */
const intro = ({ eyebrow, title, body, aside = '' }) =>
  `<header class="cell page-intro"><div>${kicker(eyebrow)}<h1>${title}</h1><p class="lead">${body}</p></div>${aside}</header>`;
const verifiedDate = new Date(evidence.startedAt).toLocaleDateString('en-NZ', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Fine-line diagrams for the three promises; strokes are drawn on view where supported. */
const diagrams = {
  design: `<svg viewBox="0 0 240 120" class="diagram" aria-hidden="true"><circle cx="120" cy="60" r="48" class="faint" stroke-dasharray="2 4"/><path d="M76 92 L168 92 L150 34 Z" pathLength="1" class="draw"/><path d="M96 92 A20 20 0 0 0 92 82" class="faint"/><text x="100" y="86">θ</text><path d="M168 92 v-10 h-10" class="faint"/><circle cx="76" cy="92" r="3" class="dot"/><circle cx="168" cy="92" r="3" class="dot"/><circle cx="150" cy="34" r="3" class="dot"/></svg>`,
  verify: `<svg viewBox="0 0 240 120" class="diagram" aria-hidden="true"><path d="M86 44 L120 26 L154 44 L154 88 L120 106 L86 88 Z M86 44 L120 62 L154 44 M120 62 L120 106" pathLength="1" class="draw"/><path d="M80 40 L114 22" class="faint"/><path d="M78 36 l4 8 M112 18 l4 8" class="faint"/><path d="M168 44 v44 M164 44 h8 M164 88 h8" class="faint"/><text x="176" y="70">68</text><circle cx="120" cy="62" r="3" class="dot"/></svg>`,
  print: `<svg viewBox="0 0 240 120" class="diagram" aria-hidden="true"><path d="M120 10 v14 M110 24 h20 l-6 10 h-8 Z" class="faint"/>${[
    0, 1, 2, 3, 4, 5,
  ]
    .map(
      (i) =>
        `<path d="M${84 + i * 0} ${98 - i * 9} L120 ${84 - i * 9} L156 ${98 - i * 9} L120 ${112 - i * 9} Z" pathLength="1" class="draw layer"/>`,
    )
    .join('')}<path d="M176 108 v-56 M172 56 l4 -6 l4 6" class="faint"/><text x="182" y="84">z</text></svg>`,
};

/**
 * Construction drawing beneath the hero model, registered with the render (hero-view.mjs). Lines
 * scale in an inner 0–1000 view; labels sit in the outer SVG at matching percentages so they keep
 * their type size.
 */
const drafting = () => {
  const { axes, ring, ticks, longTicks, extensions, dimension, zero, line } = heroDrafting();
  const at = (/** @type {number} */ value) => `${(value / 10).toFixed(2)}%`;
  return `<svg class="drafting" aria-hidden="true"><svg viewBox="0 0 1000 1000" overflow="visible"><path class="d-axes" d="${axes}" pathLength="1"/><path class="d-ring" d="${ring}" pathLength="1"/><g class="d-ticks"><path d="${ticks}"/><path class="long" d="${longTicks}"/></g><path class="d-input" d="" data-dial-input/><g class="d-dim"><path d="${extensions}" pathLength="1"/><path d="${dimension}" pathLength="1"/></g></svg><text class="d-label" x="${at(zero[0])}" y="${at(zero[1])}" text-anchor="middle">0°</text><text class="d-label d-size" x="50%" y="${at(line)}" dy="1.6em" text-anchor="middle">Ø 174 mm rim</text></svg>`;
};

const heroStage = () =>
  `<figure class="hero-stage" data-hero-stage><div class="stage-labels top"><span>Object 001 — Planetary gearbox</span><span>34 parts · Replicad</span></div><div class="hero-model">${drafting()}<img class="poster" src="/_www/assets/hero-gearbox.webp" srcset="/_www/assets/hero-gearbox-720.webp 720w, /_www/assets/hero-gearbox.webp 1200w" sizes="(max-width: 760px) 92vw, 46vw" width="1200" height="1200" fetchpriority="high" alt="A planetary gearbox rendered from Tau’s authored CAD example: a fixed ring gear, three planet gears around a sun gear, and a blue output carrier held by three socket screws"><div class="sweep" aria-hidden="true"></div><div class="stage-canvas" data-canvas-host></div></div><figcaption class="stage-labels bottom"><span class="readout" data-readout aria-live="off">Input <b data-in>0°</b> → Output <b data-out>0.0°</b> · 4:1</span><span class="stage-control" data-turn hidden><label for="turn-input">Turn the input</label><input id="turn-input" type="range" min="0" max="1440" step="5" value="0" aria-valuetext="Input 0 degrees, output 0 degrees"></span><span class="stage-note" data-note>Rendered from the authored CAD source</span></figcaption></figure>`;

/** Story stage overlays duplicate chapter facts visually; the chapter text is the accessible source. */
const storyOverlays = () => {
  const passed = evidence.tests.filter((test) => test.status === 'passed');
  return `<div class="overlay o-idea" data-for="0" aria-hidden="true"><svg viewBox="0 0 400 400"><circle class="rim" cx="200" cy="200" r="174" pathLength="1"/><circle cx="200" cy="200" r="144" pathLength="1"/><circle cx="200" cy="200" r="48" pathLength="1"/><circle cx="200" cy="104" r="48" pathLength="1"/><circle cx="283.1" cy="248" r="48" pathLength="1"/><circle cx="116.9" cy="248" r="48" pathLength="1"/><circle class="rim" cx="200" cy="200" r="96" pathLength="1"/><path d="M26 392 H374 M26 386 V398 M374 386 V398" pathLength="1"/></svg><span class="tag t1">Ring · 72 teeth · fixed</span><span class="tag t2">Sun · 24 · input</span><span class="tag t3">3 planets · 24 teeth</span><span class="tag t4">Ø 174 mm rim</span></div><div class="overlay o-prompt" data-for="1" aria-hidden="true"><div class="composer"><span class="kicker">New project</span><p>Create a planetary gearbox with a 4:1 reduction, three planets and socket screws on top.</p><span class="send">Send</span></div></div><div class="overlay o-agents" data-for="2 3" aria-hidden="true"><span class="lane l1"><b>Ring</b>Internal ring gear · 72 teeth</span><span class="lane l2"><b>Gear train</b>Sun · 3 planets · bushings</span><span class="lane l3"><b>Carrier & hardware</b>2 carriers · pins · spacers · screws</span></div><div class="overlay o-turn" data-for="4" aria-hidden="true"><span class="tag">Sun 360° → Carrier 90°</span></div><div class="overlay o-param" data-for="5" aria-hidden="true"><pre><code><span class="c">// main.ts parameters</span>\nmodule: 2,\n<del>faceWidth: 14,</del>\n<ins>faceWidth: 18,</ins>\n<del>inputAngle: 0,</del>\n<ins>inputAngle: 30,</ins></code></pre><span class="tag">Axial envelope 68 → 72 mm</span></div><div class="overlay o-evidence" data-for="6" aria-hidden="true"><div class="evidence-card"><span class="kicker">GeoSpec · recorded run</span><p class="tally"><b>${evidence.summary.passed}</b> passed <b>${evidence.summary.failed}</b> failed <b>${evidence.summary.inconclusive}</b> inconclusive</p><ul>${passed.map((test) => `<li><span class="mark ok">✓</span>${escapeHtml(test.name)}</li>`).join('')}<li><span class="mark unknown">?</span>${evidence.summary.inconclusive} need evidence GeoSpec cannot measure yet</li></ul></div></div><div class="overlay o-print" data-for="7" aria-hidden="true"><span class="tag">Build volume 256 × 256 × 256 mm</span><span class="tag subtle">Illustration · not slicer output</span></div><div class="overlay o-devices" data-for="8" aria-hidden="true"><svg viewBox="0 0 400 300"><rect x="80" y="62" width="240" height="160" rx="8" pathLength="1"/><path d="M58 234 H342 L330 246 H70 Z" pathLength="1"/></svg><div class="phone"><img src="/_www/assets/hero-gearbox-720.webp" width="720" height="720" alt="" loading="lazy" decoding="async"></div><span class="tag">Same project · synced through Tau Cloud</span></div>`;
};

const evidenceList = () =>
  `<ul class="evidence-list">${evidence.tests.map((test) => `<li data-status="${test.status}"><span class="mark ${test.status === 'passed' ? 'ok' : test.status === 'failed' ? 'bad' : 'unknown'}" aria-hidden="true">${test.status === 'passed' ? '✓' : test.status === 'failed' ? '✕' : '?'}</span><span>${escapeHtml(test.name)}</span><span class="status">${test.status === 'passed' ? 'Passed' : test.status === 'failed' ? 'Failed' : 'Inconclusive'}</span></li>`).join('')}</ul><p class="fine">Recorded ${verifiedDate} with the GeoSpec engine CLI on the authored example (model SHA-256 464caa7c…), ${Math.round(evidence.durationMs / 100) / 10} s. Inconclusive means the check needs evidence GeoSpec does not measure yet; it is not a pass. Geometric checks do not certify strength or manufacturing readiness.</p>`;

const storyMarkup = () =>
  `<section class="band story" id="story" aria-labelledby="story-title"><header class="cell section-head">${kicker('One idea, start to finish')}<h2 id="story-title">Watch a gearbox<br>come together.</h2><p>A 4:1 planetary gearbox from Tau’s authored example: 34 named parts, three planets, one sun and socket screws on top. Scroll to follow it from a sentence to the print bed.</p></header><div class="story-layout"><div class="story-visual"><figure class="story-stage" data-story-stage data-chapter="0"><div class="stage-labels top"><span data-story-count>01 / 09 · Idea</span><span>Planetary gearbox · 4:1</span></div><div class="story-canvas"><img class="poster" data-story-poster src="/_www/assets/story-4.webp" width="1000" height="1000" loading="lazy" decoding="async" alt="The assembled planetary gearbox from Tau’s authored example"><div class="stage-canvas" data-canvas-host></div>${storyOverlays()}</div><figcaption class="stage-labels bottom"><span data-story-caption>Authored Tau example · rendered from source</span><button class="stage-button" type="button" data-story-toggle hidden aria-pressed="false">Show still frames</button></figcaption></figure></div><ol class="story-chapters">${storyChapters
    .map(
      (chapter, index) =>
        `<li class="story-chapter" id="story-${chapter.id}" data-story-chapter="${index}"><p class="kicker"><span class="step">${String(index + 1).padStart(2, '0')}</span> ${chapter.label}</p><h3>${chapter.title}</h3><p>${chapter.body}</p>${chapter.id === 'verification' ? evidenceList() : ''}<p class="detail">${chapter.detail}</p>${chapter.note ? `<p class="fine">${chapter.note}</p>` : ''}</li>`,
    )
    .join(
      '',
    )}</ol></div><p class="cell story-foot">Kinematics follow the source: fixed ring, sun input, carrier output at one quarter of the sun’s rotation. Motion is prescribed, not a physical simulation. <a href="${exampleUrl}">Open the model source ${out}</a></p></section>`;

const principleStrip = () =>
  `<section class="band principles" aria-label="Design, verify, print">${principles
    .map(
      (item, index) =>
        `<article class="cell principle"><p class="kicker"><span class="step">0${index + 1}</span> ${item.id}</p>${diagrams[/** @type {'design' | 'verify' | 'print'} */ (item.id)]}<h2>${item.title}</h2><p>${item.body}</p><p class="detail">${item.detail}</p></article>`,
    )
    .join('')}</section>`;

const workspaceFigure = (loading = 'lazy') =>
  `<figure class="workspace"><picture><source media="(prefers-color-scheme: dark)" srcset="/_www/assets/workspace-dark-640.webp 640w, /_www/assets/workspace-dark-1280.webp 1280w, /_www/assets/workspace-dark-1920.webp 1920w, /_www/assets/workspace-dark-2560.webp 2560w" sizes="(max-width: 760px) calc((100vw - 48px) * 1.065), calc(min(1180px, 90vw) * 1.065)"><img src="/_www/assets/workspace-1280.webp" srcset="/_www/assets/workspace-640.webp 640w, /_www/assets/workspace-1280.webp 1280w, /_www/assets/workspace-1920.webp 1920w, /_www/assets/workspace-2560.webp 2560w" sizes="(max-width: 760px) calc((100vw - 48px) * 1.065), calc(min(1180px, 90vw) * 1.065)" width="3680" height="2384" loading="${loading}" alt="The Tau workspace: an AI conversation, editable design files, the planetary gearbox in the viewport and its parameters"></picture><figcaption><span>Actual Tau workspace</span><span>Conversation → code → geometry → checks</span></figcaption></figure>`;

const ecosystemGrid = () =>
  `<section class="band ecosystem" aria-labelledby="ecosystem-title"><header class="cell section-head">${kicker('Open by design')}<h2 id="ecosystem-title">Your tools,<br>working together.</h2><p>Choose the engine that suits the part and the model that suits the job. Apache-2.0 source you can read, run and build on.</p></header>${ecosystem
    .map(
      (group) =>
        `<div class="eco-row"><div class="cell eco-label"><h3>${group.title}</h3><p>${group.body}</p></div><ul class="eco-items">${group.items.map(([name, where]) => `<li><span>${name}</span><span class="where">${where}</span></li>`).join('')}</ul></div>`,
    )
    .join(
      '',
    )}<div class="cell eco-foot"><p>Open source. Apache-2.0. Yours to build on.</p><a class="text-link" href="${sourceUrl}">Explore the source ${out}</a></div></section>`;

const caseCards = () =>
  `<div class="case-grid">${useCases.map((item) => `<a class="case" href="/use-cases/${item.slug}/"><div class="case-image"><img src="/_www/assets/${item.image.replace('.webp', '-768.webp')}" srcset="/_www/assets/${item.image.replace('.webp', '-480.webp')} 480w, /_www/assets/${item.image.replace('.webp', '-768.webp')} 768w" sizes="(max-width: 760px) calc(100vw - 48px), 400px" alt="${item.alt}" loading="lazy" width="1536" height="1152"></div><div class="case-text">${kicker(item.audience)}<h3>${item.title} <span aria-hidden="true">→</span></h3></div></a>`).join('')}</div>`;

const planCards = (compact = false) =>
  `<div class="plans">${plans
    .map(
      (plan) =>
        `<article class="cell plan${plan.id === 'pro' ? ' featured' : ''}"><div class="plan-head"><h3>${plan.name}</h3>${plan.id === 'pro' ? '<span class="badge">Most chosen</span>' : ''}</div><p>${plan.tagline}</p><p class="price">${plan.price}<span>${plan.period}</span></p>${
          compact
            ? ''
            : `<ul>${plan.features.map(([label, flag]) => `<li${flag ? ' class="soon"' : ''}><span class="mark" aria-hidden="true">${flag ? '○' : '✓'}</span><span>${label}${flag ? ' <span class="soon-label">· Coming soon</span>' : ''}</span></li>`).join('')}</ul>`
        }${
          plan.cta[1].startsWith('mailto:')
            ? `<a class="button" href="${plan.cta[1]}">${plan.cta[0]} ${out}</a>`
            : `<a class="button${plan.id === 'pro' ? ' primary' : ''}" href="${appOrigin}${plan.cta[1]}" data-event="cta" data-placement="pricing-${plan.id}">${plan.cta[0]} ${out}</a>`
        }</article>`,
    )
    .join('')}</div>`;

const closing = (title = 'What will you<br>make real?') =>
  `<section class="band closing" aria-labelledby="closing-title"><div class="cell closing-copy">${kicker('From an idea to your next iteration')}<h2 id="closing-title">${title}</h2><div class="actions">${cta('Start designing', '/projects/new', 'closing')}<a class="text-link" href="${docsOrigin}/">Read the docs ${out}</a></div></div><div class="closing-art" aria-hidden="true"><img src="/_www/assets/metal-hero-640.webp" srcset="/_www/assets/metal-hero-640.webp 640w, /_www/assets/metal-hero.webp 1100w" sizes="(max-width: 760px) 70vw, 36vw" width="1100" height="1100" loading="lazy" alt=""></div></section>`;

/** @type {Page[]} */
export const pages = [
  {
    path: '/',
    title: 'Tau — Design Verify Print.',
    description:
      'Describe a part. Tau writes editable parametric CAD, checks the geometry against your requirements and exports it for your printer. Open source, free in your browser.',
    body: () =>
      `<section class="band hero" aria-labelledby="hero-title"><div class="cell hero-copy">${kicker('AI-native CAD')}<h1 id="hero-title"><span class="w w1">Design</span> <span class="w w2">Verify</span> <span class="w w3">Print.</span></h1><p class="lead">Describe the part you need. Tau writes real parametric CAD you can edit, checks the geometry against your requirements and exports it for your printer.</p><div class="actions">${cta('Start designing', '/projects/new', 'hero')}<a class="text-link" href="#story">Watch it come together ${down}</a></div></div>${heroStage()}</section>${principleStrip()}${storyMarkup()}<section class="band product" aria-labelledby="product-title"><header class="cell section-head split">${kicker('Your design, in view')}<h2 id="product-title">A conversation.<br>A working design.</h2><p>Talk through the idea, watch the geometry take shape, then tune the parameters, read the code and keep every revision. <a class="text-link" href="/product/">Inside the workspace →</a></p></header><div class="cell">${workspaceFigure()}</div></section>${ecosystemGrid()}<section class="band" aria-labelledby="cases-title"><header class="cell section-head">${kicker('Built for the things you want to make')}<h2 id="cases-title">Small beginnings.<br>Real possibilities.</h2></header>${caseCards()}</section><section class="band pricing-teaser" aria-labelledby="pricing-title"><header class="cell section-head split">${kicker('Pricing')}<h2 id="pricing-title">Start free.<br>Grow into Pro.</h2><p>Pay for hosted AI with credits, or choose Pro for a monthly allowance and Tau Cloud sync. <a class="text-link" href="/pricing/">Compare plans →</a></p></header>${planCards(true)}</section><section class="band vision-teaser" aria-labelledby="vision-title"><div class="cell">${kicker('The bigger picture')}<h2 id="vision-title">CAD is<br>chapter one.</h2></div><div class="cell"><p class="lead">We’re building toward a closer connection between imagination, engineering and making.</p><p>Geometry is where that starts. See what works today, what is taking shape and what we’re working toward.</p><a class="text-link" href="/vision/">Read the vision →</a></div></section>${closing()}`,
  },
  {
    path: '/product/',
    title: 'Product — Parametric CAD with AI and geometric checks · Tau',
    description:
      'Describe a part, edit parametric CAD, inspect the geometry and test declared requirements with GeoSpec. Export STL, 3MF or STEP.',
    body: () =>
      `<section class="band">${intro({ eyebrow: 'The Tau workspace · Beta', title: 'Make the design<br>understandable.', body: 'AI starts the conversation. Editable code, visible parameters and geometric checks keep you in control of what comes next.', aside: `<div class="actions">${cta('Start designing', '/projects/new', 'product')}</div>` })}<div class="cell">${workspaceFigure('eager')}</div></section>${principleStrip()}<section class="band feature-grid" aria-label="Workspace capabilities">${[
        [
          'Describe your intent',
          'Start in plain language or write the CAD code yourself. Work with the agent on a design that stays visible and editable.',
        ],
        [
          'Change the parameters',
          'Adjust the dimensions that matter and inspect the result. Source-based designs keep the modeling choices behind the object.',
        ],
        [
          'Test a requirement',
          'GeoSpec checks declared properties of the geometry: envelopes, solids, clearances and patterns. Each result states its scope; unsupported evidence is inconclusive.',
        ],
        [
          'Keep your work',
          'Back projects up to GitHub on any plan, or to Tau Cloud with sync on Pro and Enterprise. Export STL, 3MF or STEP whenever you need them.',
        ],
      ]
        .map(([title, body]) => `<article class="cell"><h2>${title}</h2><p>${body}</p></article>`)
        .join(
          '',
        )}</section>${ecosystemGrid()}<section class="band note-band"><div class="cell"><h2>Checks have a scope.</h2></div><div class="cell"><p>Geometric checks do not certify strength, thermal behavior, materials or manufacturing readiness. Use appropriate analysis and physical validation for the work you are doing.</p></div></section>${closing()}`,
  },
  {
    path: '/use-cases/',
    title: 'Use cases — Prototypes, engineering and learning · Tau',
    description:
      'Explore Tau for editable prototypes, inspectable engineering models and learning through parametric design.',
    body: () =>
      `<section class="band">${intro({ eyebrow: 'What will you make?', title: 'One workspace.<br>Many starting points.', body: 'A useful part, an engineering question or a mechanism you want to understand. Start with the thing you want to change.' })}${caseCards()}</section>${closing()}`,
  },
  ...useCases.map((item) => ({
    path: `/use-cases/${item.slug}/`,
    title: `${item.audience} · Tau`,
    description: item.description,
    body: () =>
      `<section class="band use-case">${intro({ eyebrow: item.audience, title: item.title, body: item.description, aside: `<img class="case-detail-image" src="/_www/assets/${item.image.replace('.webp', '-768.webp')}" srcset="/_www/assets/${item.image.replace('.webp', '-480.webp')} 480w, /_www/assets/${item.image.replace('.webp', '-768.webp')} 768w" sizes="(max-width: 760px) calc(100vw - 48px), 420px" width="1536" height="1152" alt="${item.alt}">` })}<ol class="steps">${item.steps.map(([title, body], index) => `<li class="cell"><p class="kicker"><span class="step">0${index + 1}</span></p><h2>${title}</h2><p>${body}</p></li>`).join('')}</ol><p class="cell fine">Images show authored Tau examples, not customer case studies. <a href="/use-cases/">All use cases →</a></p></section>${closing()}`,
  })),
  {
    path: '/vision/',
    title: 'Vision — Give ideas physical form · Tau',
    description:
      'Tau’s vision connects AI, editable design, geometric evidence and making. What works today, what is taking shape and where we are heading.',
    body: () =>
      `<section class="band">${intro({ eyebrow: 'The Tau vision', title: 'Give ideas<br><em>physical form.</em>', body: 'A thought becomes words. Words become a model. A model becomes something you can hold. We’re building the open tools that connect those steps.', aside: `<img class="vision-metal" src="/_www/assets/metal-hero.webp" srcset="/_www/assets/metal-hero-640.webp 640w, /_www/assets/metal-hero.webp 1100w" sizes="(max-width: 760px) 80vw, 40vw" width="1100" height="1100" fetchpriority="high" alt="Tau’s polished metal Escher star, rendered with the material and studio from the Tau app">` })}</section><section class="band vision-steps" aria-label="Where Tau is today and where it is heading"><ol>${visionChapters.map(([status, title, body], index) => `<li class="cell"><p class="kicker"><span class="step">0${index + 1}</span> ${status}</p><h2>${title}</h2><p>${body}</p></li>`).join('')}</ol></section><section class="band split-band"><div class="cell">${kicker('A real starting point')}<h2>The distance from<br>thought to thing.</h2></div><div class="cell"><p class="lead">A useful object starts with intent. Good tools keep that intent intact through every design decision.</p><p>We want more people to make things they understand, with inspectable source and evidence close at hand. See it in practice in the <a href="/#story">planetary gearbox story</a>, or open the <a href="${appOrigin}/vision">interactive 3D vision ${out}</a> in the Tau app.</p></div></section>${closing('Make something<br>that matters.')}`,
  },
  {
    path: '/pricing/',
    title: 'Pricing — Free, Pro US$20 and Enterprise · Tau',
    description:
      'Start free in your browser. Pro is US$20 per month plus applicable tax, with 2,000 monthly credits and 10 GB of Tau Cloud backup and sync.',
    body: () =>
      `<section class="band">${intro({ eyebrow: 'Pricing · USD', title: 'Start with an idea.<br>Choose how you build.', body: 'Use Tau free and pay for hosted AI with credits, or choose Pro for a monthly allowance and Tau Cloud backup and sync.' })}${planCards()}<p class="cell fine">Plans and limits as listed in the Tau app. Prices exclude applicable tax. ○ marks features in development; they are not part of a plan today.</p></section><section class="band faq" aria-labelledby="faq-title"><div class="cell"><h2 id="faq-title">A little more detail.</h2></div><div class="cell">${pricingFaq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div></section>${closing()}`,
  },
  {
    path: '/contact/',
    title: 'Contact — Talk to the Tau team',
    description: 'Talk to Tau about your team, an engineering workflow or a product question.',
    body: () =>
      `<section class="band">${intro({ eyebrow: 'Let’s build something', title: 'Tell us what<br>you’re working on.', body: 'An idea, a team workflow or a question about Tau. Start a conversation with the people building it.' })}<div class="contact-grid"><article class="cell"><h2>Teams & enterprise</h2><p>Your workflow, usage needs, invoicing or a data processing agreement.</p><a class="button primary" href="mailto:${salesEmail}">${salesEmail} ${out}</a></article><article class="cell"><h2>Community</h2><p>Share what you’re making, ask a question or follow the work as it happens.</p><a class="text-link" href="${discordUrl}">Join the Discord ${out}</a></article><article class="cell"><h2>Issues & source</h2><p>Found a bug or want to contribute? Tau is Apache-2.0 open source.</p><a class="text-link" href="${sourceUrl}/issues">Open an issue ${out}</a></article></div></section>`,
  },
  {
    path: '/download/',
    title: 'Get Tau — In your browser today · Tau',
    description: 'Tau runs in your browser today. Tau Desktop is in development; no installer is published yet.',
    body: () =>
      `<section class="band">${intro({ eyebrow: 'Get Tau', title: 'Your browser<br>is the workshop.', body: 'Everything you need to design, check and export runs at tau.new. No install, no setup.', aside: `<div class="actions">${cta('Open Tau in your browser', '/projects', 'download')}</div>` })}<div class="download-grid"><article class="cell" data-platform-card="web"><p class="kicker">Available now</p><h2>Browser</h2><p>Chrome, Edge, Safari or Firefox on any computer. Seven browser kernels, AI, checks and export.</p><a class="text-link" href="${appOrigin}/projects" data-event="cta" data-placement="download-web">Open tau.new ${out}</a></article><article class="cell" data-platform-card="desktop"><p class="kicker">In development</p><h2>Tau Desktop</h2><p data-platform-note>Local files, native kernels such as Build123d and PicoGK, and your own coding agents. No installer is published yet.</p><a class="text-link" href="${sourceUrl}/releases" data-desktop-link>Watch releases on GitHub ${out}</a></article></div></section>`,
  },
  {
    path: '/blog/',
    title: 'Journal — Notes from Tau',
    description:
      'Product notes and engineering stories from the people building Tau. Human-authored articles appear here after editorial review.',
    body: () =>
      `<section class="band">${intro({ eyebrow: 'The Tau journal', title: 'Notes from<br>the workbench.', body: 'The decisions, experiments and lessons behind building tools for physical creation.' })}<div class="cell journal-empty"><span class="journal-mark" aria-hidden="true">τ</span><div><h2>The first notes are taking shape.</h2><p>Human-authored product and engineering stories will appear here after review.</p><a class="text-link" href="${sourceUrl}">Follow the code ${out}</a></div></div><div id="articles"></div></section>`,
  },
  {
    path: '/privacy/',
    title: 'Privacy on this site · Tau',
    description: 'How the Tau marketing site handles optional analytics, browser storage and links to the Tau app.',
    body: () =>
      `<section class="band">${intro({ eyebrow: 'Marketing site', title: 'Privacy, with<br>clear choices.', body: 'This page covers this marketing website. The Tau application has its own privacy and account terms.' })}<article class="cell prose"><h2>Optional analytics</h2><p>Analytics is off by default. When an approved analytics endpoint is configured, you can allow a small set of page and action events or continue without them. Declining does not change the site’s content.</p><p>We do not use session replay, automatic click capture, fingerprinting, account identifiers or form contents. Page events contain a known page label, not the address bar, query string or referrer. Only explicitly allowlisted campaign codes can be counted.</p><h2>Browser storage</h2><p>Your analytics preference is stored on this device. If you allow analytics, a browser-local marker can indicate a returning visit without sending a persistent visitor identifier. You can withdraw consent and clear these markers below.</p><button type="button" class="button" data-consent-reset>Reset analytics preference</button><p role="status" id="privacy-status"></p><h2>Hosting and external links</h2><p>The hosting provider may process ordinary request information to deliver and secure this site. Opening the Tau app, documentation or GitHub takes you to a separate service with its own terms.</p><p><a href="${appOrigin}/legal/privacy">Read the Tau application privacy policy ${out}</a></p></article></section>`,
  },
  {
    path: '/404.html',
    title: 'Page not found · Tau',
    description: 'This page is not available. Return to the Tau homepage or open the workspace.',
    error: true,
    body: () =>
      `<section class="band">${intro({ eyebrow: '404 / Page not found', title: 'This path<br>ends here.', body: 'The link may have changed. Start from the homepage or head back to your projects.', aside: `<div class="actions"><a class="button primary" href="/">Back to Tau</a><a class="text-link" href="${appOrigin}/projects">Open projects ${out}</a></div>` })}</section>`,
  },
];

const navLinks = (/** @type {string} */ current) =>
  navigation
    .map(([label, path]) => `<a href="${path}"${current === path ? ' aria-current="page"' : ''}>${label}</a>`)
    .join('');
/** Inline marker so the first paint knows JavaScript runs; its hash is added to the CSP. */
export const bootScript = "document.documentElement.classList.add('js')";

/**
 * Render a complete static page.
 * @internal
 * @param options - Build-validated settings.
 * @returns Standalone HTML document.
 * @type {(options: {page: Page, origin: string, launch: boolean, asset: {css: string, js: string}, analyticsEndpoint: string}) => string}
 */
export const renderPage = ({ page, origin, launch, asset, analyticsEndpoint }) => {
  const canonical = origin ? new URL(page.path, origin).href : undefined;
  const robots = launch && !page.error ? 'index,follow' : 'noindex,nofollow';
  const metadata = canonical
    ? `<link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${origin}/_www/assets/social.png"><meta name="twitter:card" content="summary_large_image">`
    : '';
  const structured = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Tau',
    description: 'Open-source parametric CAD with AI and geometric checks',
    ...(origin ? { url: origin } : {}),
  }).replaceAll('<', String.raw`<`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(page.title)}</title><meta name="description" content="${escapeHtml(page.description)}"><meta name="robots" content="${robots}"><meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#1d1d1d" media="(prefers-color-scheme: dark)"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(page.title)}"><meta property="og:description" content="${escapeHtml(page.description)}"><meta property="og:site_name" content="Tau">${metadata}<link rel="icon" href="/_www/assets/favicon.svg" type="image/svg+xml"><link rel="preload" href="/_www/assets/geist.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="${asset.css}"><script>${bootScript}</script><script type="application/ld+json">${structured}</script><script type="module" src="${asset.js}"></script></head><body data-page="${page.path}" data-analytics-endpoint="${escapeHtml(analyticsEndpoint)}"><a class="skip" href="#main">Skip to content</a><header class="site-header"><div class="header-inner">${brand}<nav class="primary-nav" aria-label="Main navigation">${navLinks(page.path)}<a href="${docsOrigin}/">Docs ${out}</a></nav><div class="header-actions"><a class="signin" href="${appOrigin}/auth/sign-in">Sign in</a><a class="button primary small" href="${appOrigin}/projects/new" data-event="cta" data-placement="header">Start designing ${out}</a><details class="mobile-menu"><summary aria-label="Menu"><span class="bars" aria-hidden="true"></span><span class="menu-label">Menu</span></summary><nav aria-label="Mobile navigation">${navLinks(page.path)}<a href="${docsOrigin}/">Docs ${out}</a><a href="/contact/"${page.path === '/contact/' ? ' aria-current="page"' : ''}>Contact</a><a href="/download/"${page.path === '/download/' ? ' aria-current="page"' : ''}>Get Tau</a><a href="${appOrigin}/auth/sign-in">Sign in ${out}</a></nav></details></div></div></header><main id="main" class="frame">${page.body()}</main><footer class="site-footer frame"><div class="band footer-grid"><div class="cell footer-brand">${brand}<p>Design Verify Print.</p><p class="fine">Open-source CAD for the things you want to make.</p></div><nav class="cell" aria-label="Product"><h2>Product</h2><a href="/product/">Workspace</a><a href="/use-cases/">Use cases</a><a href="/pricing/">Pricing</a><a href="/download/">Get Tau</a><a href="${appOrigin}/projects/new">Start designing ${out}</a></nav><nav class="cell" aria-label="Company"><h2>Company</h2><a href="/vision/">Vision</a><a href="/blog/">Journal</a><a href="/contact/">Contact</a></nav><nav class="cell" aria-label="Resources"><h2>Resources</h2><a href="${docsOrigin}/">Documentation ${out}</a><a href="${sourceUrl}">GitHub ${out}</a><a href="${discordUrl}">Discord ${out}</a></nav><nav class="cell" aria-label="Legal"><h2>Legal</h2><a href="/privacy/">Site privacy</a><a href="${appOrigin}/legal/privacy">App privacy ${out}</a><a href="${appOrigin}/legal/terms">Terms ${out}</a><a href="/_www/assets/THIRD_PARTY_LICENSES.txt">Licenses</a></nav></div><div class="band footer-bottom"><span class="cell">© 2026 Tau · Apache-2.0</span><span class="cell">Beta product · Marketing preview</span><button type="button" class="cell" data-consent-open hidden>Analytics preferences</button></div></footer><aside class="consent" aria-label="Optional analytics" hidden><p><strong>Help us understand what’s useful?</strong><br>Allow basic page and action counts. No session replay. <a href="/privacy/">Privacy details</a></p><div class="actions"><button type="button" class="button" data-consent="denied">Continue without</button><button type="button" class="button primary" data-consent="accepted">Allow analytics</button></div></aside></body></html>`;
};

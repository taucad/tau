import { storyMarkup } from '#www/story.js';
import { appOrigin, navigation, useCases, visionChapters } from '#www/content.js';
/** @typedef {{path: string, title: string, description: string, error?: boolean, body: () => string}} Page */

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
const arrow = '<span aria-hidden="true">↗</span>';
const cta = (label = 'Start a project', path = '/projects/new') =>
  `<a class="button primary" href="${appOrigin}${path}" data-event="cta" data-placement="primary">${label} ${arrow}</a>`;
/**
 * @param text - Section label.
 * @type {(text: string) => string}
 */
const kicker = (text) => `<p class="kicker">${text}</p>`;
/**
 * @param options - Authored introduction.
 * @type {(options: {eyebrow: string, title: string, body: string}) => string}
 */
const intro = ({ eyebrow, title, body }) =>
  `<header class="page-intro">${kicker(eyebrow)}<h1>${title}</h1><p class="lead">${body}</p></header>`;
const endCta = () =>
  `<section class="closing wrap">${kicker('From an idea to your next iteration')}<h2>Make something<br>you can build on.</h2>${cta()}<p class="small">Browser-based CAD. Editable source. Your next idea.</p></section>`;
const model = () =>
  `<figure class="assembly" aria-label="Planetary assembly illustration"><div class="assembly-top"><span class="kicker">Assembly study / 001</span><span class="small">Parametric CAD</span></div><div class="assembly-stage"><img id="assembly-image" src="/_www/assets/exploded.webp" srcset="/_www/assets/exploded-640.webp 640w, /_www/assets/exploded.webp 1000w" sizes="(max-width:760px) calc(100vw - 32px), 640px" width="1000" height="1000" alt="Exploded view of an authored planetary assembly with a fixed ring, three planet gears and a blue carrier" decoding="async" loading="lazy"><span class="model-label label-top">Coaxial input & output</span><span class="model-label label-bottom">A design you can inspect</span></div><figcaption><span id="assembly-caption">Authored Tau example · 4:1 planetary stage</span><a href="https://github.com/taucad/tau/tree/faecc9ac8f456b7fa5639fc0eb146012e3e499c8/libs/tau-examples/src/kernels/replicad/planetary-gear-system">View source ${arrow}</a></figcaption><div class="view-controls" aria-label="Assembly views" aria-hidden="true"><button type="button" data-view="assembly" aria-pressed="false">Assembled</button><button type="button" data-view="exploded" aria-pressed="true">Exploded</button><span class="small">Saved geometry · not a simulation</span></div></figure>`;
const cases = () =>
  `<div class="case-grid">${useCases.map((item) => `<a class="case" href="/use-cases/${item.slug}/"><div class="case-image"><img src="/_www/assets/${item.image.replace('.webp', '-768.webp')}" srcset="/_www/assets/${item.image.replace('.webp', '-480.webp')} 480w, /_www/assets/${item.image.replace('.webp', '-768.webp')} 768w" sizes="(max-width:760px) calc(100vw - 32px), 420px" alt="${item.alt}" loading="lazy" width="1536" height="1152"></div>${kicker(item.audience)}<h3>${item.title} ${arrow}</h3></a>`).join('')}</div>`;
/** @type {Page[]} */
export const pages = [
  {
    path: '/',
    title: 'Tau — Design, verify, print everywhere.',
    description:
      'Describe a part. Build with AI and code. Inspect the geometry, refine the parameters and keep your design editable in Tau.',
    body: () =>
      `<section class="hero wrap"><div class="hero-copy">${kicker('AI-native CAD · Built for making')}<h1>Design, verify,<br>print <em>everywhere.</em></h1><p class="lead">Bring your ideas into the physical world. Create with AI, refine real CAD, and check the geometry before your next step.</p><div class="actions">${cta('Start creating')}<a class="text-link" href="#design-story">See how it works <span aria-hidden="true">↓</span></a></div><p class="small">Free workspace. In your browser. Your source to keep.</p></div><figure class="metal-hero"><img src="/_www/assets/metal-hero.webp" srcset="/_www/assets/metal-hero-640.webp 640w, /_www/assets/metal-hero.webp 1100w" sizes="(max-width:760px) 90vw, 50vw" width="1100" height="1100" fetchpriority="high" alt="Tau’s polished metal Escher star, a geometric form with folded reflective faces"><figcaption>Imagination, taking form.</figcaption></figure></section><div class="principles wrap"><span>AI + parametric CAD</span><span>Geometric checks</span><span>Open source. Open possibilities.</span></div>${storyMarkup()}<section class="product-band"><div class="wrap"><div class="section-heading">${kicker('Your design, in view')}<h2>Code. Conversation.<br>One working model.</h2><a class="text-link" href="/product/">Inside the workspace →</a></div><figure class="workspace"><img src="/_www/assets/workspace-1280.webp" srcset="/_www/assets/workspace-640.webp 640w, /_www/assets/workspace-1280.webp 1280w" sizes="(max-width:760px) calc(100vw - 32px), min(1280px, 95vw)" width="2000" height="1250" loading="lazy" alt="Tau workspace showing an AI conversation, editable design files, geometry viewport and parameters"><figcaption>Actual Tau workspace · example design session</figcaption></figure></div></section><section class="section wrap"><div class="section-heading">${kicker('Built for the things you want to make')}<h2>Small beginnings.<br>Real possibilities.</h2></div>${cases()}</section><section class="vision-band"><div class="wrap split"><div>${kicker('The bigger picture')}<h2>CAD is<br>chapter one.</h2></div><div><p class="lead">We’re building toward a closer connection between imagination, engineering and making.</p><p>Geometry is where that journey starts. Explore what works today, what is taking shape and what we’re working toward.</p><a class="text-link" href="/vision/">Read the vision →</a></div></div></section>${endCta()}`,
  },
  {
    path: '/product/',
    title: 'Product — CAD with AI, code and geometric checks · Tau',
    description:
      'Explore the Tau workflow: describe a part, edit parametric CAD, inspect geometry and test declared requirements with GeoSpec.',
    body: () =>
      `<div class="wrap">${intro({ eyebrow: 'The Tau workspace · Beta', title: 'Make the design<br>understandable.', body: 'AI gets the conversation started. Editable code, visible parameters and geometric checks help you stay in control of what comes next.' })}<figure class="workspace"><img src="/_www/assets/workspace-1280.webp" srcset="/_www/assets/workspace-640.webp 640w, /_www/assets/workspace-1280.webp 1280w" sizes="(max-width:760px) calc(100vw - 32px), min(1280px, 95vw)" width="2000" height="1250" alt="The Tau CAD workspace with source files, AI chat, a 3D assembly and its parameters"><figcaption>Actual Tau workspace · example design session</figcaption></figure><section class="section feature-rows">${[
        [
          'Describe your intent',
          'Start a project in plain language or write the CAD code yourself. Work with the agent on a design that remains visible and editable.',
        ],
        [
          'Change the parameters',
          'Adjust the dimensions that matter and inspect the resulting geometry. Source-based designs preserve the modeling choices behind the object.',
        ],
        [
          'Test a requirement',
          'GeoSpec checks declared properties of geometry. Use it to examine dimensions, solids and spatial relationships; review the scope and results of each check.',
        ],
        [
          'Keep the next step open',
          'Export through the formats supported by your model and kernel. Retain source and exact engineering artifacts alongside visual exports.',
        ],
      ]
        .map(([title, body]) => `<article><h2>${title}</h2><p>${body}</p></article>`)
        .join(
          '',
        )}</section><section class="note"><h2>Checks have a scope.</h2><p>Geometric checks do not certify strength, thermal behavior, materials or manufacturing readiness. Use appropriate analysis and physical validation for the work you are doing.</p></section></div>${endCta()}`,
  },
  {
    path: '/use-cases/',
    title: 'Use cases — Prototypes, engineering and learning · Tau',
    description:
      'Explore Tau for editable prototypes, inspectable engineering models and learning through parametric design.',
    body: () =>
      `<div class="wrap">${intro({ eyebrow: 'What will you make?', title: 'One workspace.<br>Many starting points.', body: 'A useful part, an engineering question or a mechanism you want to understand. Start with the thing you want to change.' })}${cases()}</div>${endCta()}`,
  },
  ...useCases.map((item) => ({
    path: `/use-cases/${item.slug}/`,
    title: `${item.audience} · Tau`,
    description: item.description,
    body: () =>
      `<div class="wrap"><div class="split use-case-intro">${intro({ eyebrow: item.audience, title: item.title, body: item.description })}<img class="case-detail-image" src="/_www/assets/${item.image.replace('.webp', '-768.webp')}" srcset="/_www/assets/${item.image.replace('.webp', '-480.webp')} 480w, /_www/assets/${item.image.replace('.webp', '-768.webp')} 768w" sizes="(max-width:760px) calc(100vw - 32px), 420px" width="1536" height="1152" alt="${item.alt}"></div><section class="feature-rows">${item.steps.map(([title, body]) => `<article><h2>${title}</h2><p>${body}</p></article>`).join('')}</section><p class="small">Images show authored Tau examples, not customer case studies.</p></div>${endCta()}`,
  })),
  {
    path: '/vision/',
    title: 'Vision — Give ideas physical form · Tau',
    description:
      'Tau’s vision connects AI, editable design, geometric evidence and making. Explore today’s CAD workflow and future directions.',
    body: () =>
      `<div class="wrap">${intro({ eyebrow: 'The Tau vision', title: 'Give ideas<br><em>physical form.</em>', body: 'A thought becomes words. Words become a model. A model becomes something you can hold. We’re building the open tools that connect those steps.' })}<div class="vision-art">${model()}<div><p class="kicker">A real starting point</p><h2>The distance from<br>thought to thing.</h2><p class="lead">A useful object starts with intent. The tools should help you preserve it through each design decision.</p><p>We want more people to make things they understand, with inspectable source and evidence close at hand.</p></div></div><div class="vision-chapters">${visionChapters.map(([status, title, body]) => `<article>${kicker(status)}<h2>${title}</h2><p>${body}</p></article>`).join('')}</div><section class="note"><h2>The 3D vision story</h2><p>Explore the earlier interactive presentation, with chapter controls and a text equivalent, in the Tau app.</p><a class="text-link" href="${appOrigin}/vision">Open the 3D story ${arrow}</a></section></div>${endCta()}`,
  },
  {
    path: '/pricing/',
    title: 'Pricing — Free workspace and US$20 Pro · Tau',
    description:
      'Start with the free Tau workspace. Pro is US$20 per month plus applicable tax, with 2,000 monthly credits. Buy additional credits as needed.',
    body: () =>
      `<div class="wrap">${intro({ eyebrow: 'Pricing · USD', title: 'Start with an idea.<br>Choose how you build.', body: 'Use the free workspace. Add credits for Tau-hosted AI, or choose Pro for a monthly credit allowance.' })}<div class="pricing-grid"><article class="price-card"><h2>Free</h2><p>For your next idea.</p><p class="price">US$0<span> / month</span></p><ul><li>Code-based CAD workspace</li><li>Local geometric validation</li><li>Supported geometry exports</li><li>Buy credits when you need hosted AI</li><li>Tau Cloud backup &amp; sync <span class="soon">Coming soon</span></li></ul>${cta('Open Tau')}</article><article class="price-card featured"><div class="plan-heading"><h2>Pro</h2><span class="badge">Monthly</span></div><p>Keep the iterations coming.</p><p class="price">US$20<span> / month</span></p><p class="small">Plus applicable tax.</p><ul><li>2,000 credits every month</li><li>Unused plan credits roll over, up to 4,000</li><li>Private and unlisted share links</li><li>Additional credit purchases available</li><li>Hosted design verification <span class="soon">Coming soon</span></li><li>Tau Cloud backup &amp; sync <span class="soon">Coming soon</span></li></ul>${cta('View plans in Tau', '/settings/billing')}</article><article class="price-card"><h2>Enterprise</h2><p>For the way your team works.</p><p class="price">Custom</p><ul><li>Everything in Pro</li><li>Custom usage credit allotment</li><li>Contractual no-train guarantee (DPA)</li><li>Dedicated technical contact</li><li>Signed evidence reports &amp; retention <span class="soon">Coming soon</span></li><li>Verification CI &amp; org dashboards <span class="soon">Coming soon</span></li></ul><a class="button" href="mailto:sales@tau.new">Contact sales ↗</a></article></div><section class="faq"><h2>A little more detail.</h2><details><summary>How do credits work?</summary><p>Credits pay for metered Tau-hosted activity. Usage varies by model and task, so a credit balance is not a guaranteed number of designs. Review usage and available plans in the app.</p></details><details><summary>Can I buy credits without Pro?</summary><p>Yes. Purchased credits cost US$1 per 100 credits, with manual top-ups from US$5 to US$5,000 before applicable tax. Purchased credits do not expire.</p></details><details><summary>Does the free plan include AI credits?</summary><p>The free plan does not include a recurring complimentary credit grant. You can buy credits when you want to use Tau-hosted AI.</p></details><details><summary>What happens to unused Pro credits?</summary><p>Unused plan credits roll over up to a 4,000-credit paid-plan grant ceiling. Purchased credits are separate and do not expire. Review current subscription and cancellation terms in the app before purchasing.</p></details><details><summary>Is hosted verification included?</summary><p>Local geometric validation is available. Hosted design verification and broader enterprise services are development directions; they are not included here as available products.</p></details></section></div>${endCta()}`,
  },
  {
    path: '/contact/',
    title: 'Contact — Talk to the Tau team',
    description: 'Talk to Tau about your team, an engineering workflow or a product question.',
    body: () =>
      `<div class="wrap">${intro({ eyebrow: 'Let’s build something', title: 'Tell us what<br>you’re working on.', body: 'An idea, a team workflow or a question about Tau. Start a conversation with the people building it.' })}<section class="contact-grid"><article><h2>Teams & enterprise</h2><p>Discuss your workflow, usage needs and enterprise requirements.</p><a class="button primary" href="mailto:sales@tau.new">sales@tau.new ↗</a></article><article><h2>Build with the community</h2><p>Share what you’re making, ask a question or explore the open-source project.</p><a class="text-link" href="https://discord.gg/6pfSAN3t7A">Join Discord ↗</a><a class="text-link" href="https://github.com/taucad/tau/issues">Report an issue ↗</a></article></section></div>${endCta()}`,
  },
  {
    path: '/download/',
    title: 'Use Tau in your browser · Tau',
    description:
      'Open the Tau browser workspace. Desktop download links are listed only when supported release artifacts have been verified.',
    body: () =>
      `<div class="wrap">${intro({ eyebrow: 'Start building', title: 'Your browser<br>is a starting point.', body: 'Open the Tau workspace to explore code-based CAD, AI-assisted modeling and geometric checks.' })}${cta('Open the browser workspace', '/projects')}<section class="section note"><h2>Desktop releases</h2><p>No verified desktop installer is listed on this preview. The browser workspace is the available entry point here.</p><a href="https://github.com/taucad/tau/releases">View the release repository ${arrow}</a></section></div>`,
  },
  {
    path: '/blog/',
    title: 'Journal — Notes from Tau',
    description:
      'Product notes and engineering stories from the people building Tau. Human-authored articles will appear here after editorial review.',
    body: () =>
      `<div class="wrap">${intro({ eyebrow: 'The Tau journal', title: 'Notes from<br>the workbench.', body: 'The decisions, experiments and lessons behind building tools for physical creation.' })}<section class="journal-empty"><span class="journal-mark" aria-hidden="true">τ</span><div><h2>The first notes are taking shape.</h2><p>Human-authored product and engineering stories will appear here after review.</p><a class="text-link" href="https://github.com/taucad/tau">Follow the code ${arrow}</a></div></section><div id="articles"></div></div>${endCta()}`,
  },
  {
    path: '/privacy/',
    title: 'Privacy on this preview · Tau',
    description: 'How the Tau marketing preview handles optional analytics, browser storage and links to the Tau app.',
    body: () =>
      `<article class="wrap prose">${intro({ eyebrow: 'Marketing preview', title: 'Privacy, with<br>clear choices.', body: 'This page describes this marketing website. The Tau application has its own privacy and account terms.' })}<h2>Optional analytics</h2><p>Analytics is off by default. When an approved analytics endpoint is configured, you can allow a small set of page and action events or continue without them. Rejecting analytics does not change the site’s content.</p><p>We do not use session replay, automatic click capture, fingerprinting, account identifiers or form contents. Page events contain a known page label, not the address bar, query string or referrer. Only explicitly allowlisted campaign codes can be counted.</p><h2>Browser storage</h2><p>Your analytics preference is stored on this device. If you allow analytics, a browser-local marker can indicate a returning visit without sending a persistent visitor identifier. You can withdraw consent and clear these markers using the control below.</p><button type="button" class="button" data-consent-reset>Reset analytics preference</button><p role="status" id="privacy-status"></p><h2>Hosting and external links</h2><p>The hosting provider may process ordinary request information to deliver and secure this site. Opening the Tau app, documentation or GitHub takes you to a separate service with its own terms.</p><p><a href="${appOrigin}/legal/privacy">Read the Tau application privacy policy ${arrow}</a></p></article>`,
  },
  {
    path: '/404.html',
    title: 'Page not found · Tau',
    description: 'This page is not available. Return to the Tau homepage or open the workspace.',
    error: true,
    body: () =>
      `<div class="wrap error-page">${kicker('404 / Page not found')}<h1>This path<br>ends here.</h1><p class="lead">The link may have changed. Start from the homepage or head back to your projects.</p><div class="actions"><a class="button primary" href="/">Back to Tau</a><a class="text-link" href="${appOrigin}/projects">Open projects →</a></div></div>`,
  },
];
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
    description: 'AI-assisted, code-based CAD and geometric checks',
    ...(origin ? { url: origin } : {}),
  }).replaceAll('<', String.raw`\u003c`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(page.title)}</title><meta name="description" content="${escapeHtml(page.description)}"><meta name="robots" content="${robots}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(page.title)}"><meta property="og:description" content="${escapeHtml(page.description)}"><meta property="og:site_name" content="Tau">${metadata}<link rel="icon" href="/_www/assets/favicon.svg" type="image/svg+xml"><link rel="preload" href="/_www/assets/geist.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="${asset.css}"><script type="application/ld+json">${structured}</script><script type="module" src="${asset.js}"></script></head><body data-page="${page.path}" data-analytics-endpoint="${escapeHtml(analyticsEndpoint)}"><a class="skip" href="#main">Skip to content</a><header class="site-header wrap"><a class="wordmark" href="/" aria-label="Tau home"><img src="/_www/assets/favicon.svg" width="29" height="29" alt=""><span>tau</span></a><details class="mobile-menu"><summary>Menu</summary><nav aria-label="Mobile navigation">${navigation.map(([label, path]) => `<a href="${path}"${page.path === path ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav></details><nav id="navigation" aria-label="Main navigation">${navigation.map(([label, path]) => `<a href="${path}"${page.path === path ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav><a class="header-cta" href="${appOrigin}/projects" data-event="cta" data-placement="header">Open Tau ${arrow}</a></header><main id="main">${page.body()}</main><footer class="site-footer wrap"><div class="footer-top"><a class="wordmark" href="/" aria-label="Tau home"><img src="/_www/assets/favicon.svg" width="29" height="29" alt=""><span>tau</span></a><p>Design, verify, print everywhere.</p></div><div class="footer-links"><a href="https://docs.tau.new/">Documentation</a><a href="https://github.com/taucad/tau">GitHub</a><a href="/download/">Use Tau</a><a href="/contact/">Contact</a><a href="https://discord.gg/6pfSAN3t7A">Community</a><a href="/privacy/">Privacy</a><a href="${appOrigin}/legal/terms">Terms</a><a href="/_www/assets/THIRD_PARTY_LICENSES.txt">Licenses</a><a href="${appOrigin}/auth/sign-in">Sign in</a></div><div class="footer-bottom"><span>© 2026 Tau</span><span>Marketing preview · Beta product</span><button type="button" data-consent-open hidden>Analytics preferences</button></div></footer><aside class="consent" aria-label="Optional analytics" hidden><p><strong>Help us understand what’s useful?</strong><br>Allow basic page and action counts. No session replay. <a href="/privacy/">Privacy details</a></p><div class="actions"><button type="button" class="button" data-consent="denied">Continue without</button><button type="button" class="button primary" data-consent="accepted">Allow analytics</button></div></aside></body></html>`;
};

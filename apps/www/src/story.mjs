/** The visible reading path remains complete without JavaScript or a GPU. */
export const storyChapters = [
  {
    id: 'concept',
    label: 'Describe',
    title: 'Start with what you need.',
    body: 'A compact gearbox. A precise reduction. A part that fits. Turn the constraints in your head into a design you can inspect.',
    detail: '“Create a planetary gearbox with a 4:1 reduction.”',
  },
  {
    id: 'agents',
    label: 'Create',
    title: 'Give each part a purpose.',
    body: 'Work with AI on the ring, the gears and the carrier. The result is real parametric CAD: named parts, editable code and dimensions you control.',
    detail: 'Ring gear · Gear train · Carrier & hardware',
  },
  {
    id: 'formation',
    label: 'Shape',
    title: 'Watch the idea take shape.',
    body: 'Inspect the teeth, shafts, bearings and fasteners. Start from the whole design, then look closely at the details that make it work.',
    detail: '34 parts · 3 planets · 1 sun',
  },
  {
    id: 'assembly',
    label: 'Assemble',
    title: 'See how it comes together.',
    body: 'Bring the parts into place. The fixed ring, rotating sun and moving carrier reveal the relationship behind this planetary stage.',
    detail: '24 / 24 / 72 teeth · 4:1 reduction',
  },
  {
    id: 'iteration',
    label: 'Refine',
    title: 'The first answer is a beginning.',
    body: 'Ask for a change. Adjust the parameters and inspect the next revision. Keep the source and the decisions behind the geometry in view.',
    detail: 'Same design. Editable dimensions. Another iteration.',
  },
  {
    id: 'verification',
    label: 'Verify',
    title: 'Give the design a test.',
    body: 'Check declared geometric requirements with GeoSpec. Measure dimensions and spatial relationships, then use the evidence to decide what changes next.',
    detail: 'Geometric checks today · Hosted verification coming soon',
  },
  {
    id: 'printing',
    label: 'Print',
    title: 'Take it into the real world.',
    body: 'Export supported geometry for your fabrication workflow. Choose your material, review tolerances and prepare the part for the machine that will make it.',
    detail: 'Print workflow illustration · No live print job',
  },
  {
    id: 'devices',
    label: 'Everywhere',
    title: 'Keep your ideas within reach.',
    body: 'Open the browser workspace where you work. Explore a model, continue the conversation and carry editable source into your next step.',
    detail: 'Browser workspace available · Cloud backup & sync coming soon',
  },
];
export const storyMarkup = () =>
  `<section class="story-section wrap" id="design-story" aria-labelledby="story-title"><header class="section-heading"><p class="kicker">From a prompt to a part</p><h2 id="story-title">One idea.<br>Every step forward.</h2><p>Follow a planetary gearbox from a design brief to a making workflow.</p></header><div class="story-layout"><div class="story-visual"><figure class="story-frame" data-story-stage><div class="story-top"><span class="kicker">Planetary gearbox</span><span class="story-count">34 parts / 4:1</span></div><div class="story-canvas"><img class="story-poster" src="/assets/exploded.webp" srcset="/assets/exploded-640.webp 640w, /assets/exploded.webp 1000w" sizes="(max-width:760px) 90vw, 55vw" width="1000" height="1000" loading="lazy" alt="Exploded 34-part planetary gearbox with three planet gears, ring, carrier and top socket screws"><div class="story-surface" aria-hidden="true"></div><div class="story-brief" aria-hidden="true"><span class="kicker">The design brief</span><p>“Create a planetary gearbox<br>with a 4:1 reduction.”</p></div><div class="agent-tasks" aria-hidden="true"><span class="kicker">Illustrated agent tasks</span><div><span>Ring<small>72 internal teeth</small></span><span>Gears<small>1 sun · 3 planets</small></span><span>Carrier<small>Plates &amp; hardware</small></span></div></div><div class="story-overlay" aria-hidden="true"><span data-scene-label>Editable parts. One mechanism.</span></div></div><figcaption><span data-scene-caption>Authored Tau example · Scroll to explore</span><button class="story-toggle" type="button" data-story-toggle hidden aria-pressed="false">Pause motion</button></figcaption></figure><p class="story-disclosure">Illustrated design workflow. Motion is prescribed, not a physical simulation. <a href="https://github.com/taucad/tau/tree/faecc9ac8f456b7fa5639fc0eb146012e3e499c8/libs/tau-examples/src/kernels/replicad/planetary-gear-system">Inspect the source ↗</a></p></div><div class="story-chapters">${storyChapters.map((chapter, index) => `<article class="story-chapter" id="story-${chapter.id}" data-story-chapter="${index}"><p class="kicker">${String(index + 1).padStart(2, '0')} / ${chapter.label}</p><h3>${chapter.title}</h3><p>${chapter.body}</p><div class="story-detail">${chapter.detail}</div></article>`).join('')}</div></div></section>`;

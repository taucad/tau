/** Public copy only. Commercial and capability provenance lives in README.md. */
export const sourceUrl = 'https://github.com/taucad/tau';
export const exampleUrl = `${sourceUrl}/tree/199c8079d5ee42f8c5771fc2cb02bf2791cc3bdf/libs/tau-examples/src/kernels/replicad/planetary-gear-system`;
export const discordUrl = 'https://discord.gg/6pfSAN3t7A';
export const salesEmail = 'sales@tau.new';

export const navigation = [
  ['Product', '/product/'],
  ['Use cases', '/use-cases/'],
  ['Vision', '/vision/'],
  ['Pricing', '/pricing/'],
  ['Blog', '/blog/'],
];

/** The three promises, each with a line diagram drawn in the site's fine-line language. */
export const principles = [
  {
    id: 'design',
    title: 'Start with a purpose.',
    body: 'A mount that fits. A housing that protects. Describe the job, then shape the part with editable code and dimensions you control.',
    detail: 'Your idea → editable CAD',
  },
  {
    id: 'verify',
    title: 'Check what matters.',
    body: 'Set the dimensions, clearances and hole patterns your part needs. GeoSpec checks the geometry against them and shows where more evidence is needed.',
    detail: 'Dimensions · clearances · fit',
  },
  {
    id: 'make',
    title: 'Put it to work.',
    body: 'Export STEP for your machining workflow, or STL and 3MF for 3D printing. Make the part, assemble it and try it where it belongs.',
    detail: 'Machine · print · assemble',
  },
];

/**
 * The planetary story. Labels state what is real (the authored model, its parameters,
 * a recorded GeoSpec run) and what is illustration (agent tasks, print preparation).
 */
export const storyChapters = [
  {
    id: 'idea',
    label: 'Idea',
    title: 'Start with the constraints.',
    body: 'A reduction you need, a space it has to fit, the hardware it will connect to. Start with the job the gearbox needs to do.',
    detail: '4:1 reduction · 174 mm rim · M3 socket screws',
  },
  {
    id: 'prompt',
    label: 'Prompt',
    title: 'Say it in a sentence.',
    body: 'Describe the mechanism the way you would to a colleague. Tau turns the request into a plan of named parts.',
    detail: '“Create a planetary gearbox with a 4:1 reduction, three planets and socket screws on top.”',
  },
  {
    id: 'agents',
    label: 'Parts',
    title: 'Every part gets its own task.',
    body: 'The ring, the gear train and the carrier hardware are worked on as separate, named parts. Each is parametric source you can open and edit.',
    detail: 'Ring gear · Gear train · Carrier & hardware',
    note: 'Illustration of a design session',
  },
  {
    id: 'formation',
    label: 'Geometry',
    title: 'Code becomes geometry.',
    body: 'Each part’s source evaluates to a solid. Teeth, pins, bushings and fasteners resolve from the same shared parameters.',
    detail: '34 solids · 24 / 24 / 72 teeth',
  },
  {
    id: 'assembly',
    label: 'Assembly',
    title: 'Then it goes together.',
    body: 'Carrier, pins and bearings first; planets, sun and ring next; the output carrier and its screws last. One turn of the sun moves the carrier a quarter turn.',
    detail: 'Fixed ring · sun input · carrier output · 4:1',
  },
  {
    id: 'parameter',
    label: 'Parameter',
    title: 'Change one number.',
    body: 'Widen the gears from 14 to 18 mm. The ring, pins, bushings and hardware follow the source, and the axial envelope grows from 68 to 72 mm.',
    detail: 'faceWidth 14 → 18 · inputAngle 0° → 30°',
  },
  {
    id: 'verification',
    label: 'Evidence',
    title: 'Check it against the requirements.',
    body: 'The example declares ten GeoSpec requirements. Anything GeoSpec cannot yet measure comes back inconclusive, never as a pass.',
    detail: 'Recorded GeoSpec run',
  },
  {
    id: 'print',
    label: 'Make',
    title: 'Choose how to make it.',
    body: 'Take STEP into your machining workflow, or export a mesh for a slicer. This print example places the ring gear on a 256 mm plate.',
    detail: '3D printing illustration · no job is sent',
  },
  {
    id: 'devices',
    label: 'Anywhere',
    title: 'Pick it up on another computer.',
    body: 'Back the project up to Tau Cloud and open it wherever you sign in to Tau: its files, its revision history and, unless you turn them off, its chats.',
    detail: 'Tau Cloud backup & sync · Pro and Enterprise',
  },
];

/** Geometry engines from libs/types kernel constants. Desktop entries are labelled as such. */
export const ecosystem = [
  {
    title: 'Geometry engines',
    body: 'Precise solids, meshes, implicit fields and circuits.',
    items: [
      ['OpenSCAD', 'Browser'],
      ['Replicad', 'Browser'],
      ['JSCAD', 'Browser'],
      ['Manifold', 'Browser'],
      ['OpenCascade', 'Browser'],
      ['PicoVoxel', 'Browser'],
      ['tscircuit', 'Browser'],
      ['Zoo KCL', 'Cloud · Pro'],
      ['Build123d', 'Desktop · in development'],
      ['PicoGK', 'Desktop · in development'],
    ],
  },
  {
    title: 'Models',
    body: 'Tau-hosted AI, paid with credits.',
    items: [
      ['Anthropic', 'Claude'],
      ['OpenAI', 'GPT'],
      ['Google', 'Gemini'],
      ['xAI', 'Grok'],
      ['Together AI', 'Open-weight models'],
    ],
  },
  {
    title: 'Coding agents',
    body: 'Bring your own agent to Tau Desktop.',
    items: [
      ['Claude Code', 'Desktop · in development'],
      ['Codex', 'Desktop · in development'],
      ['Grok Build', 'Desktop · in development'],
    ],
  },
];

export const useCases = [
  {
    slug: 'prototyping',
    title: 'Make a part you can try.',
    audience: 'For makers & product designers',
    description:
      'Design an enclosure, a custom mount or a replacement component around a real need. Check the fit in CAD, make a prototype and learn from using it.',
    image: 'quadcopter.webp',
    alt: 'Tau example of a parametric racing quadcopter frame',
    steps: [
      [
        'Start with the constraints',
        'Describe what the part needs to hold, where it needs to fit and which dimensions you already know.',
      ],
      [
        'Verify the fit',
        'Check the dimensions, mounting holes and clearances against your requirements. Adjust the parameters as you learn.',
      ],
      [
        'Make it and try it',
        'Export STEP for machining or STL and 3MF for printing. Choose the material and process, make the part, then bring what you learn back into the design.',
      ],
    ],
  },
  {
    slug: 'engineering',
    title: 'Design for the job ahead.',
    audience: 'For engineers & technical teams',
    description:
      'Develop parts around the interfaces, clearances and dimensions they need in use. Keep requirements beside the CAD source and carry the design into your manufacturing workflow.',
    image: 'engine.webp',
    alt: 'V8 engine model from the Tau example library',
    steps: [
      ['Make intent explicit', 'Declare the envelope, interfaces and clearances that constrain the design.'],
      [
        'Check the geometry',
        'GeoSpec evaluates declared geometric requirements. A pass is evidence about that requirement, not a general safety certification; unsupported evidence is reported as inconclusive.',
      ],
      [
        'Take it into manufacture',
        'Export STEP to prepare machining in your CAM tools or share the model with a manufacturer. Review materials, tolerances and tooling, then validate the finished part in use.',
      ],
    ],
  },
  {
    slug: 'learning',
    title: 'Understand it by changing it.',
    audience: 'For students & curious minds',
    description:
      'Explore a mechanism, change its dimensions and check what happens. Connect the model on screen to a part you can make, assemble and learn from.',
    image: 'heat-exchanger.webp',
    alt: 'Parametric heat exchanger example in Tau',
    steps: [
      ['Open an example', 'Begin with a model you can inspect instead of an empty canvas.'],
      [
        'Change it and check it',
        'Adjust a dimension or ask the agent to explain a modeling choice. Use geometric checks to see how the design meets its requirements.',
      ],
      [
        'Learn by making',
        'Export a model for a workshop project. Compare the finished part with the design, try it in an assembly and use what you learn in the next revision.',
      ],
    ],
  },
];

/** @type {Array<[string, string, string]>} */
export const visionChapters = [
  [
    'Today',
    'Design. Verify. Make.',
    'Describe a useful part, shape it in editable CAD and check its geometry. Export files to take the design into machining, printing or your wider fabrication workflow.',
  ],
  [
    'Foundation',
    'Objects that move.',
    'Kinematic models describe how parts move together. Prescribed movement illustrates a mechanism; it does not predict loads, wear or material behavior.',
  ],
  [
    'Direction',
    'Bring the workshop closer.',
    'We’re working toward a closer connection between design, fabrication, sourcing and service. Today, exports carry your model into the tools you use to make it; deeper manufacturing coordination is still in development.',
  ],
  [
    'Principle',
    'People keep the judgment.',
    'Good tools help more people make useful things. You choose the materials and process, review the evidence and decide when a design is ready to become a physical part.',
  ],
];

/** Plans from apps/libs/billing tau-plan-catalog and entitlements; prices in USD. */
export const plans = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'For the next thing you’ll make.',
    price: 'US$0',
    period: 'forever',
    features: [
      ['All AI models, paid with credits'],
      ['All open-source CAD kernels'],
      ['Unlimited local geometry checks'],
      ['Export to every supported format'],
      ['Public share links'],
      ['Back up to GitHub'],
    ],
    cta: ['Start designing', '/projects/new'],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Keep designing, checking and making.',
    price: 'US$20',
    period: 'per month, plus applicable tax',
    features: [
      ['Everything in Free'],
      ['2,000 credits every month'],
      ['Unused plan credits roll over, up to 4,000'],
      ['Tau Cloud backup & sync, 10 GB'],
      ['Zoo KCL cloud kernel, metered'],
      ['Private and unlisted share links'],
      ['No training on your designs'],
    ],
    cta: ['Choose Pro in Tau', '/?settings=billing'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For the way your team works.',
    price: 'Custom',
    period: 'annual agreement',
    features: [
      ['Everything in Pro'],
      ['Tau Cloud backup & sync, 100 GB'],
      ['Custom credit allotment'],
      ['Contractual no-train guarantee (DPA)'],
      ['Dedicated technical contact'],
      ['Invoicing and PO support'],
      ['Verification CI and org dashboards', 'soon'],
    ],
    cta: ['Talk to us', `mailto:${salesEmail}`],
  },
];

/** @type {Array<[string, string]>} */
export const pricingFaq = [
  [
    'How do credits work?',
    'Credits pay for metered Tau-hosted activity such as AI models and the Zoo KCL kernel. Usage varies by model and task, so a balance is not a guaranteed number of designs.',
  ],
  [
    'Can I buy credits without Pro?',
    'Yes. Credits cost US$1 per 100, with top-ups from US$5 to US$5,000 before applicable tax. Purchased credits do not expire.',
  ],
  [
    'What does Tau Cloud backup & sync include?',
    'On Pro and Enterprise, each project’s files and revision history back up to Tau Cloud and sync wherever you sign in. Chats travel with the project unless you turn chat sync off for it. Storage is per account: 10 GB on Pro, 100 GB on Enterprise. You need to be signed in; while offline you keep working on your local copy.',
  ],
  [
    'Can I back up on the Free plan?',
    'Yes, to GitHub. Every plan can connect a project to a GitHub repository. Tau Cloud sync is part of Pro and Enterprise.',
  ],
  [
    'What happens to unused Pro credits?',
    'Unused plan credits roll over up to 4,000. Purchased credits are separate and never expire. Review subscription and cancellation terms in the app before purchasing.',
  ],
];
